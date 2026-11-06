import { verifyReadAccess } from '@shared/auth/authorization-service';
import {
  dbGetAssistantById,
  dbLiftSuspensionOnAssistant,
  dbSetAssistantSuspended,
} from '@shared/db/functions/assistants';
import {
  dbGetCharacterById,
  dbLiftSuspensionOnCharacter,
  dbSetCharacterSuspended,
} from '@shared/db/functions/character';
import {
  dbGetLearningScenarioById,
  dbLiftSuspensionOnLearningScenario,
  dbSetLearningScenarioSuspended,
} from '@shared/db/functions/learning-scenario';
import {
  dbCreateSuspensionRequest,
  dbGetAllSuspensionRequestsWithEntityDetails,
  dbGetSuspensionRequestsByEntityRefWithEntityDetails,
  dbMarkSuspensionRequestAsChecked,
} from '@shared/db/functions/suspension-requests';
import { dbGetUserById } from '@shared/db/functions/user';
import {
  SuspensionRequestReason,
  suspensionRequestReasonSchema,
  SuspensionRequestSelectModel,
} from '@shared/db/schema';
import {
  assertEntityType,
  EntityRef,
  EntityType,
  throwEntityInvalidArgumentError,
} from '@shared/entities/entity-types';
import { checkParameterUUID, InvalidArgumentError, NotFoundError } from '@shared/error';
import { z } from 'zod';

const suspensionRequestDescriptionSchema = z.string().max(500);

type SuspensionRequestEntityOverviewStatus = 'new' | 'suspended' | 'checked';

export type SuspensionRequestEntityOverview = {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  requestCount: number;
  status: SuspensionRequestEntityOverviewStatus;
  latestRequestAt: Date;
  reasons: { id: string; reason: SuspensionRequestReason }[];
};

type SuspensionRequest = Awaited<
  ReturnType<typeof dbGetAllSuspensionRequestsWithEntityDetails>
>[number];

type SuspensionRequestAggregate = Pick<
  SuspensionRequestEntityOverview,
  'requestCount' | 'latestRequestAt' | 'reasons'
> & {
  hasUncheckedRequests: boolean;
};

/**
 * Resolves the referenced entity from the given entity type and id.
 * Throws when the id is invalid, the entity type is unsupported, or the entity does not exist.
 */
async function resolveTargetEntity({ entityType, entityId }: EntityRef) {
  assertEntityType(entityType);
  checkParameterUUID(entityId);

  switch (entityType) {
    case 'assistant': {
      const assistant = await dbGetAssistantById({ assistantId: entityId });
      if (!assistant) {
        throw new NotFoundError('Assistant not found');
      }
      return assistant;
    }

    case 'character': {
      const character = await dbGetCharacterById({ characterId: entityId });
      if (!character) {
        throw new NotFoundError('Character not found');
      }
      return character;
    }

    case 'learningScenario': {
      const learningScenario = await dbGetLearningScenarioById({ learningScenarioId: entityId });
      if (!learningScenario) {
        throw new NotFoundError('Learning scenario not found');
      }
      return learningScenario;
    }

    default:
      throwEntityInvalidArgumentError();
  }
}

export async function createSuspensionRequest({
  entityType,
  entityId,
  requesterId,
  reason,
  description,
}: EntityRef & {
  requesterId: string;
  reason: string;
  description: string;
}) {
  checkParameterUUID(requesterId);

  const validatedReason = suspensionRequestReasonSchema.parse(reason);
  const validatedDescription = suspensionRequestDescriptionSchema.parse(description);

  const requester = await dbGetUserById({ userId: requesterId });
  if (!requester) {
    throw new NotFoundError('Requester not found');
  }

  const targetEntity = await resolveTargetEntity({ entityType, entityId });
  verifyReadAccess({
    item: targetEntity,
    user: requester,
  });

  return dbCreateSuspensionRequest({
    suspensionRequest: {
      assistantId: entityType === 'assistant' ? entityId : undefined,
      characterId: entityType === 'character' ? entityId : undefined,
      learningScenarioId: entityType === 'learningScenario' ? entityId : undefined,
      requesterId,
      reason: validatedReason,
      description: validatedDescription,
    },
  });
}

export async function markSuspensionRequestAsChecked(suspensionRequestId: string) {
  checkParameterUUID(suspensionRequestId);
  return dbMarkSuspensionRequestAsChecked({ suspensionRequestId });
}

export async function suspendEntity(entityRef: EntityRef) {
  const { entityType, entityId } = entityRef;
  assertEntityType(entityType);
  checkParameterUUID(entityId);
  switch (entityType) {
    case 'assistant':
      return dbSetAssistantSuspended({ assistantId: entityId });
    case 'character':
      return dbSetCharacterSuspended({ characterId: entityId });
    case 'learningScenario':
      return dbSetLearningScenarioSuspended({ learningScenarioId: entityId });
    default:
      throwEntityInvalidArgumentError();
  }
}

export async function liftSuspensionOnEntity(entityRef: EntityRef) {
  const { entityType, entityId } = entityRef;
  assertEntityType(entityType);
  checkParameterUUID(entityId);
  switch (entityType) {
    case 'assistant':
      return dbLiftSuspensionOnAssistant({ assistantId: entityId });
    case 'character':
      return dbLiftSuspensionOnCharacter({ characterId: entityId });
    case 'learningScenario':
      return dbLiftSuspensionOnLearningScenario({ learningScenarioId: entityId });
    default:
      throwEntityInvalidArgumentError();
  }
}

function groupSuspensionRequestsByEntity(suspensionRequests: SuspensionRequest[]): Array<{
  entityType: EntityType;
  entityId: string;
  suspensionRequests: SuspensionRequest[];
}> {
  const groupedSuspensionRequests = new Map<string, SuspensionRequest[]>();

  for (const suspensionRequest of suspensionRequests) {
    const groupKey = `${suspensionRequest.entityType}:${suspensionRequest.entityId}`;
    const existingRequests = groupedSuspensionRequests.get(groupKey) ?? [];
    existingRequests.push(suspensionRequest);
    groupedSuspensionRequests.set(groupKey, existingRequests);
  }

  return Array.from(groupedSuspensionRequests.entries()).map(([groupKey, groupedRequests]) => {
    const [entityType, entityId] = groupKey.split(':');

    if (!entityType || !entityId) {
      throw new InvalidArgumentError('Invalid suspension request target grouping');
    }

    return {
      entityType: entityType as EntityType,
      entityId,
      suspensionRequests: groupedRequests,
    };
  });
}

function getSuspensionRequestAggregate(
  suspensionRequests: SuspensionRequest[],
): SuspensionRequestAggregate {
  if (suspensionRequests.length === 0) {
    throw new InvalidArgumentError('Invalid suspension request target grouping');
  }

  return {
    requestCount: suspensionRequests.length,
    latestRequestAt: suspensionRequests.reduce(
      (latest, current) => (current.createdAt > latest ? current.createdAt : latest),
      suspensionRequests[0]!.createdAt,
    ),
    reasons: suspensionRequests.map((suspensionRequest) => ({
      id: suspensionRequest.id,
      reason: suspensionRequest.reason,
    })),

    hasUncheckedRequests: suspensionRequests.some(
      (suspensionRequest) => !suspensionRequest.checked,
    ),
  };
}

function throwNotFoundForEntity(entityType: EntityType): never {
  assertEntityType(entityType);

  switch (entityType) {
    case 'assistant':
      throw new NotFoundError('Assistant not found');
    case 'character':
      throw new NotFoundError('Character not found');
    case 'learningScenario':
      throw new NotFoundError('Learning scenario not found');
    default:
      throwEntityInvalidArgumentError();
  }
}

function buildSuspensionRequestEntityOverview(groupedSuspensionRequest: {
  entityType: EntityType;
  entityId: string;
  suspensionRequests: SuspensionRequest[];
}): SuspensionRequestEntityOverview {
  const entity = groupedSuspensionRequest.suspensionRequests[0];

  if (!entity || !entity.entityName || entity.suspended === null) {
    throwNotFoundForEntity(groupedSuspensionRequest.entityType);
  }

  const aggregate = getSuspensionRequestAggregate(groupedSuspensionRequest.suspensionRequests);

  return {
    entityType: groupedSuspensionRequest.entityType,
    entityId: groupedSuspensionRequest.entityId,
    entityName: entity.entityName,
    requestCount: aggregate.requestCount,
    status: entity.suspended ? 'suspended' : aggregate.hasUncheckedRequests ? 'new' : 'checked',
    latestRequestAt: aggregate.latestRequestAt,
    reasons: aggregate.reasons,
  };
}

export async function getSuspensionRequestOverviews(): Promise<SuspensionRequestEntityOverview[]> {
  const allSuspensionRequests = await dbGetAllSuspensionRequestsWithEntityDetails();

  const groupedSuspensionRequests = groupSuspensionRequestsByEntity(allSuspensionRequests);

  const overviewItems = groupedSuspensionRequests.map((groupedSuspensionRequest) =>
    buildSuspensionRequestEntityOverview(groupedSuspensionRequest),
  );

  const sorted = overviewItems.sort(
    (a, b) => b.latestRequestAt.getTime() - a.latestRequestAt.getTime(),
  );

  return sorted;
}

/**
 * Retrieves an entity overview together with all related suspension requests.
 * The entity is identified by the combination of entity type and entity id.
 * This is used to display the detailed view in the admin interface.
 * @param entityType The type of the entity (assistant, character, or learning scenario)
 * @param entityId The id of the entity
 * @returns The detailed suspension request entity overview and related suspension requests
 */
export async function getSuspensionRequestItemWithDetails({
  entityType,
  entityId,
}: EntityRef): Promise<{
  suspendedItem: SuspensionRequestEntityOverview;
  requests: SuspensionRequestSelectModel[];
}> {
  checkParameterUUID(entityId);

  const entityRef = { entityType, entityId };
  const suspensionRequests = await dbGetSuspensionRequestsByEntityRefWithEntityDetails(entityRef);
  const groupedSuspensionRequests = groupSuspensionRequestsByEntity([...suspensionRequests]);

  const overviewItem = groupedSuspensionRequests.map((groupedSuspensionRequest) =>
    buildSuspensionRequestEntityOverview(groupedSuspensionRequest),
  )[0];

  if (!overviewItem)
    throw new NotFoundError('Suspension request overview not found for the given entity');

  return { suspendedItem: overviewItem, requests: suspensionRequests };
}
