import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import {
  getSuspensionRequestOverviews,
  getSuspensionRequestItemWithDetails,
  liftSuspensionOnEntity,
  markSuspensionRequestAsChecked,
  createSuspensionRequest,
  suspendEntity,
} from './suspension-service';
import { ForbiddenError, InvalidArgumentError, NotFoundError } from '@shared/error';
import { generateUUID } from '@shared/utils/uuid';
import { dbGetUserById } from '@shared/db/functions/user';
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
  dbGetAllSuspensionRequestsWithEntityDetails,
  dbGetSuspensionRequestsByEntityRefWithEntityDetails,
  dbCreateSuspensionRequest,
  dbMarkSuspensionRequestAsChecked,
} from '@shared/db/functions/suspension-requests';
import { verifyReadAccess } from '@shared/auth/authorization-service';
import { AssistantSelectModel } from '@shared/db/schema';

vi.mock('@shared/db/functions/user', () => ({
  dbGetUserById: vi.fn(),
}));

vi.mock('@shared/db/functions/assistants', () => ({
  dbGetAssistantById: vi.fn(),
  dbLiftSuspensionOnAssistant: vi.fn(),
  dbSetAssistantSuspended: vi.fn(),
}));

vi.mock('@shared/db/functions/character', () => ({
  dbGetCharacterById: vi.fn(),
  dbLiftSuspensionOnCharacter: vi.fn(),
  dbSetCharacterSuspended: vi.fn(),
}));

vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbGetLearningScenarioById: vi.fn(),
  dbLiftSuspensionOnLearningScenario: vi.fn(),
  dbSetLearningScenarioSuspended: vi.fn(),
}));

vi.mock('@shared/db/functions/suspension-requests', () => ({
  dbGetAllSuspensionRequestsWithEntityDetails: vi.fn(),
  dbGetSuspensionRequestsByEntityRefWithEntityDetails: vi.fn(),
  dbCreateSuspensionRequest: vi.fn(),
  dbMarkSuspensionRequestAsChecked: vi.fn(),
}));

vi.mock('@shared/auth/authorization-service', () => ({
  verifyReadAccess: vi.fn(),
}));

type SuspensionRequestWithEntityDetails = Awaited<
  ReturnType<typeof dbGetAllSuspensionRequestsWithEntityDetails>
>[number];

function buildSuspensionRequestWithEntityDetails(
  overrides: Partial<SuspensionRequestWithEntityDetails>,
): SuspensionRequestWithEntityDetails {
  return {
    id: generateUUID(),
    assistantId: null,
    characterId: null,
    learningScenarioId: null,
    requesterId: generateUUID(),
    reason: 'other',
    description: 'fixture',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    checked: true,
    entityType: 'assistant',
    entityId: generateUUID(),
    entityName: 'Fixture Entity',
    suspended: false,
    ...overrides,
  };
}

describe('suspension-request-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('createSuspensionRequest', () => {
    it('creates a suspension request for an accessible assistant', async () => {
      const assistantId = generateUUID();
      const requesterId = generateUUID();
      const suspensionRequestId = generateUUID();

      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: requesterId,
        schoolIds: [generateUUID()],
      } as never);
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue({
        id: assistantId,
        hasLinkAccess: false,
        userId: requesterId,
        ownerSchoolIds: [generateUUID()],
      } as never);
      (
        dbCreateSuspensionRequest as MockedFunction<typeof dbCreateSuspensionRequest>
      ).mockResolvedValue({
        id: suspensionRequestId,
      } as never);

      const result = await createSuspensionRequest({
        entityType: 'assistant',
        entityId: assistantId,
        requesterId,
        reason: 'other',
        description: 'Looks suspicious',
      });

      expect(verifyReadAccess).toHaveBeenCalledTimes(1);
      expect(dbCreateSuspensionRequest).toHaveBeenCalledWith({
        suspensionRequest: {
          assistantId,
          characterId: undefined,
          learningScenarioId: undefined,
          requesterId,
          reason: 'other',
          description: 'Looks suspicious',
        },
      });
      expect(result).toEqual({ id: suspensionRequestId });
    });

    it('creates a suspension request for an accessible assistant with empty description', async () => {
      const assistantId = generateUUID();
      const requesterId = generateUUID();
      const suspensionRequestId = generateUUID();

      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: requesterId,
        schoolIds: [generateUUID()],
      } as never);
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue({
        id: assistantId,
        hasLinkAccess: false,
        userId: requesterId,
        ownerSchoolIds: [generateUUID()],
      } as never);
      (
        dbCreateSuspensionRequest as MockedFunction<typeof dbCreateSuspensionRequest>
      ).mockResolvedValue({
        id: suspensionRequestId,
      } as never);

      const result = await createSuspensionRequest({
        entityType: 'assistant',
        entityId: assistantId,
        requesterId,
        reason: 'other',
        description: '',
      });

      expect(verifyReadAccess).toHaveBeenCalledTimes(1);
      expect(dbCreateSuspensionRequest).toHaveBeenCalledWith({
        suspensionRequest: {
          assistantId,
          characterId: undefined,
          learningScenarioId: undefined,
          requesterId,
          reason: 'other',
          description: '',
        },
      });
      expect(result).toEqual({ id: suspensionRequestId });
    });

    it('throws for invalid entity id', async () => {
      const requesterId = generateUUID();
      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: requesterId,
        schoolIds: [generateUUID()],
      } as never);

      await expect(
        createSuspensionRequest({
          entityType: 'assistant',
          entityId: 'invalid-uuid',
          requesterId,
          reason: 'other',
          description: 'test',
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it('throws NotFoundError if requester does not exist', async () => {
      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue(undefined);

      await expect(
        createSuspensionRequest({
          entityType: 'assistant',
          entityId: generateUUID(),
          requesterId: generateUUID(),
          reason: 'other',
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if assistant does not exist', async () => {
      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: generateUUID(),
        schoolIds: [generateUUID()],
      } as never);
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockRejectedValue(
        new NotFoundError('Assistant not found'),
      );

      await expect(
        createSuspensionRequest({
          entityType: 'assistant',
          entityId: generateUUID(),
          requesterId: generateUUID(),
          reason: 'other',
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('propagates ForbiddenError from verifyReadAccess', async () => {
      const assistantId = generateUUID();
      const requesterId = generateUUID();

      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: requesterId,
        schoolIds: [generateUUID()],
      } as never);
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue({
        id: assistantId,
        hasLinkAccess: false,
        userId: generateUUID(),
        ownerSchoolIds: [generateUUID()],
      } as never);
      (verifyReadAccess as MockedFunction<typeof verifyReadAccess>).mockImplementation(() => {
        throw new ForbiddenError('Not authorized for read access');
      });

      await expect(
        createSuspensionRequest({
          entityType: 'assistant',
          entityId: assistantId,
          requesterId,
          reason: 'other',
          description: 'test',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('creates a suspension request for an accessible character', async () => {
      const characterId = generateUUID();
      const requesterId = generateUUID();
      const suspensionRequestId = generateUUID();

      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: requesterId,
        schoolIds: [generateUUID()],
      } as never);
      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue({
        id: characterId,
        hasLinkAccess: false,
        userId: requesterId,
        ownerSchoolIds: [generateUUID()],
      } as never);
      (
        dbCreateSuspensionRequest as MockedFunction<typeof dbCreateSuspensionRequest>
      ).mockResolvedValue({
        id: suspensionRequestId,
      } as never);

      const result = await createSuspensionRequest({
        entityType: 'character',
        entityId: characterId,
        requesterId,
        reason: 'other',
        description: 'Looks suspicious',
      });

      expect(dbCreateSuspensionRequest).toHaveBeenCalledWith({
        suspensionRequest: {
          assistantId: undefined,
          characterId,
          learningScenarioId: undefined,
          requesterId,
          reason: 'other',
          description: 'Looks suspicious',
        },
      });
      expect(result).toEqual({ id: suspensionRequestId });
    });

    it('throws NotFoundError if learning scenario does not exist', async () => {
      (dbGetUserById as MockedFunction<typeof dbGetUserById>).mockResolvedValue({
        id: generateUUID(),
        schoolIds: [generateUUID()],
      } as never);
      (
        dbGetLearningScenarioById as MockedFunction<typeof dbGetLearningScenarioById>
      ).mockResolvedValue(undefined);

      await expect(
        createSuspensionRequest({
          entityType: 'learningScenario',
          entityId: generateUUID(),
          requesterId: generateUUID(),
          reason: 'other',
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('markSuspensionRequestAsChecked', () => {
    it('marks suspension request as checked', async () => {
      const suspensionRequestId = generateUUID();
      (
        dbMarkSuspensionRequestAsChecked as MockedFunction<typeof dbMarkSuspensionRequestAsChecked>
      ).mockResolvedValue({ id: suspensionRequestId, checked: true } as never);

      const result = await markSuspensionRequestAsChecked(suspensionRequestId);

      expect(dbMarkSuspensionRequestAsChecked).toHaveBeenCalledWith({ suspensionRequestId });
      expect(result).toEqual({ id: suspensionRequestId, checked: true });
    });

    it('throws InvalidArgumentError for invalid uuid', async () => {
      await expect(markSuspensionRequestAsChecked('invalid-uuid')).rejects.toThrow(
        InvalidArgumentError,
      );
    });
  });

  describe('suspendEntity / liftSuspensionOnEntity', () => {
    it('suspends and unsuspends assistant using entity ref', async () => {
      const assistantId = generateUUID();
      (dbSetAssistantSuspended as MockedFunction<typeof dbSetAssistantSuspended>).mockResolvedValue(
        { id: assistantId, suspended: true } as never,
      );
      (
        dbLiftSuspensionOnAssistant as MockedFunction<typeof dbLiftSuspensionOnAssistant>
      ).mockResolvedValue({ id: assistantId, suspended: false } as never);

      await suspendEntity({ entityType: 'assistant', entityId: assistantId });
      expect(dbSetAssistantSuspended).toHaveBeenCalledWith({ assistantId });

      await liftSuspensionOnEntity({ entityType: 'assistant', entityId: assistantId });
      expect(dbLiftSuspensionOnAssistant).toHaveBeenCalledWith({ assistantId });
    });

    it('suspends and unsuspends character using entity ref', async () => {
      const characterId = generateUUID();
      (dbSetCharacterSuspended as MockedFunction<typeof dbSetCharacterSuspended>).mockResolvedValue(
        { id: characterId, suspended: true } as never,
      );
      (
        dbLiftSuspensionOnCharacter as MockedFunction<typeof dbLiftSuspensionOnCharacter>
      ).mockResolvedValue({ id: characterId, suspended: false } as never);

      await suspendEntity({ entityType: 'character', entityId: characterId });
      expect(dbSetCharacterSuspended).toHaveBeenCalledWith({ characterId });

      await liftSuspensionOnEntity({ entityType: 'character', entityId: characterId });
      expect(dbLiftSuspensionOnCharacter).toHaveBeenCalledWith({ characterId });
    });

    it('suspends and unsuspends learning scenario using entity ref', async () => {
      const learningScenarioId = generateUUID();
      (
        dbSetLearningScenarioSuspended as MockedFunction<typeof dbSetLearningScenarioSuspended>
      ).mockResolvedValue({ id: learningScenarioId, suspended: true } as never);
      (
        dbLiftSuspensionOnLearningScenario as MockedFunction<
          typeof dbLiftSuspensionOnLearningScenario
        >
      ).mockResolvedValue({ id: learningScenarioId, suspended: false } as never);

      await suspendEntity({ entityType: 'learningScenario', entityId: learningScenarioId });
      expect(dbSetLearningScenarioSuspended).toHaveBeenCalledWith({ learningScenarioId });

      await liftSuspensionOnEntity({
        entityType: 'learningScenario',
        entityId: learningScenarioId,
      });
      expect(dbLiftSuspensionOnLearningScenario).toHaveBeenCalledWith({ learningScenarioId });
    });

    it('throws for unsupported entity type', async () => {
      await expect(
        suspendEntity({
          entityType: 'invalid' as never,
          entityId: generateUUID(),
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('getSuspensionRequestOverviews', () => {
    it('returns grouped suspension request overviews sorted by latest suspension request date', async () => {
      const assistantId = generateUUID();
      const characterId = generateUUID();
      const requesterId = generateUUID();
      const requestId1 = generateUUID();
      const requestId2 = generateUUID();
      const requestId3 = generateUUID();

      (
        dbGetAllSuspensionRequestsWithEntityDetails as MockedFunction<
          typeof dbGetAllSuspensionRequestsWithEntityDetails
        >
      ).mockResolvedValue([
        buildSuspensionRequestWithEntityDetails({
          id: requestId1,
          assistantId,
          requesterId,
          reason: 'discrimination',
          description: 'a',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          checked: false,
          entityType: 'assistant',
          entityId: assistantId,
          entityName: 'Assistant A',
          suspended: false,
        }),
        buildSuspensionRequestWithEntityDetails({
          id: requestId2,
          assistantId,
          requesterId,
          reason: 'other',
          description: 'b',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          checked: true,
          entityType: 'assistant',
          entityId: assistantId,
          entityName: 'Assistant A',
          suspended: false,
        }),
        buildSuspensionRequestWithEntityDetails({
          id: requestId3,
          characterId,
          requesterId,
          reason: 'other',
          description: 'c',
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
          checked: true,
          entityType: 'character',
          entityId: characterId,
          entityName: 'Character C',
          suspended: true,
        }),
      ] as never);

      const result = await getSuspensionRequestOverviews();

      expect(result).toHaveLength(2);
      const first = result.at(0);
      const second = result.at(1);
      expect(first).toBeDefined();
      expect(second).toBeDefined();

      expect(first?.entityType).toBe('character');
      expect(first?.status).toBe('suspended');
      expect(first?.reasons).toHaveLength(1);
      expect(first?.reasons).toEqual(expect.arrayContaining([{ id: requestId3, reason: 'other' }]));
      expect(second?.entityType).toBe('assistant');
      expect(second?.requestCount).toBe(2);
      expect(second?.status).toBe('new');
      expect(second?.reasons).toHaveLength(2);
      expect(second?.reasons).toEqual(
        expect.arrayContaining([
          { id: requestId1, reason: 'discrimination' },
          { id: requestId2, reason: 'other' },
        ]),
      );
    });

    it('throws NotFoundError when grouped character cannot be resolved', async () => {
      const characterId = generateUUID();

      (
        dbGetAllSuspensionRequestsWithEntityDetails as MockedFunction<
          typeof dbGetAllSuspensionRequestsWithEntityDetails
        >
      ).mockResolvedValue([
        buildSuspensionRequestWithEntityDetails({
          id: generateUUID(),
          characterId,
          requesterId: generateUUID(),
          reason: 'other',
          description: 'c',
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
          checked: true,
          entityType: 'character',
          entityId: characterId,
          entityName: null,
          suspended: null,
        }),
      ] as never);

      await expect(getSuspensionRequestOverviews()).rejects.toThrow(NotFoundError);
    });

    it('returns learning scenario overview with checked status', async () => {
      const learningScenarioId = generateUUID();
      const requestId = generateUUID();

      (
        dbGetAllSuspensionRequestsWithEntityDetails as MockedFunction<
          typeof dbGetAllSuspensionRequestsWithEntityDetails
        >
      ).mockResolvedValue([
        buildSuspensionRequestWithEntityDetails({
          id: requestId,
          learningScenarioId,
          requesterId: generateUUID(),
          reason: 'other',
          description: 'l',
          createdAt: new Date('2026-01-04T00:00:00.000Z'),
          checked: true,
          entityType: 'learningScenario',
          entityId: learningScenarioId,
          entityName: 'Scenario L',
          suspended: false,
        }),
      ] as never);

      const result = await getSuspensionRequestOverviews();

      expect(result).toHaveLength(1);
      expect(result[0]?.entityType).toBe('learningScenario');
      expect(result[0]?.status).toBe('checked');
      expect(result[0]?.reasons).toEqual([{ id: requestId, reason: 'other' }]);
    });
  });

  describe('getSuspendedItemWithDetails', () => {
    it('returns details overview and all requests for the given entity ref', async () => {
      const assistantId = generateUUID();
      const requesterId = generateUUID();
      const requestId1 = generateUUID();
      const requestId2 = generateUUID();

      (
        dbGetSuspensionRequestsByEntityRefWithEntityDetails as MockedFunction<
          typeof dbGetSuspensionRequestsByEntityRefWithEntityDetails
        >
      ).mockResolvedValue([
        buildSuspensionRequestWithEntityDetails({
          id: requestId1,
          assistantId,
          requesterId,
          reason: 'discrimination',
          description: 'a',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          checked: false,
          entityType: 'assistant',
          entityId: assistantId,
          entityName: 'Assistant A',
          suspended: false,
        }),
        buildSuspensionRequestWithEntityDetails({
          id: requestId2,
          assistantId,
          requesterId,
          reason: 'other',
          description: 'b',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          checked: true,
          entityType: 'assistant',
          entityId: assistantId,
          entityName: 'Assistant A',
          suspended: false,
        }),
      ] as never);

      const result = await getSuspensionRequestItemWithDetails({
        entityType: 'assistant',
        entityId: assistantId,
      });

      expect(dbGetSuspensionRequestsByEntityRefWithEntityDetails).toHaveBeenCalledWith({
        entityType: 'assistant',
        entityId: assistantId,
      });
      expect(result.suspendedItem).toEqual({
        entityType: 'assistant',
        entityId: assistantId,
        entityName: 'Assistant A',
        requestCount: 2,
        status: 'new',
        latestRequestAt: new Date('2026-01-02T00:00:00.000Z'),
        reasons: [
          { id: requestId1, reason: 'discrimination' },
          { id: requestId2, reason: 'other' },
        ],
      });
      expect(result.requests).toHaveLength(2);
      expect(result.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: requestId1 }),
          expect.objectContaining({ id: requestId2 }),
        ]),
      );
    });

    it('throws NotFoundError when no suspension requests exist for the entity ref', async () => {
      const assistantId = generateUUID();

      (
        dbGetSuspensionRequestsByEntityRefWithEntityDetails as MockedFunction<
          typeof dbGetSuspensionRequestsByEntityRefWithEntityDetails
        >
      ).mockResolvedValue([] as never);

      await expect(
        getSuspensionRequestItemWithDetails({
          entityType: 'assistant',
          entityId: assistantId,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
