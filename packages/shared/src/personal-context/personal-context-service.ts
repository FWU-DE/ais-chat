import {
  dbGetPersonalContextByUserId,
  dbSetConversationPersonalContextEnabled,
  dbSetPersonalContextAutoUpdateEnabled,
  dbSetPersonalContextEnabled,
  dbUpsertPersonalContent,
} from '../db/functions/personal-context';
import type { FederalStateFeatureToggles, UserRole } from '../db/schema';
import { ForbiddenError, NotFoundError } from '../error';
import { isPersonalContextAvailable } from './personal-context-availability';
import { PERSONAL_CONTEXT_MAX_CHARS } from './personal-context-document';

export {
  isPersonalContextAvailable,
  resolvePersonalContextEnabled,
} from './personal-context-availability';

/**
 * Returns the stored markdown, or undefined when there is nothing to inject.
 */
export async function getPersonalContextContent({
  userId,
}: {
  userId: string;
}): Promise<string | undefined> {
  const personalContext = await dbGetPersonalContextByUserId({ userId });

  if (personalContext === undefined || !personalContext.enabled) {
    return undefined;
  }

  const content = personalContext.content.trim();

  return content.length > 0 ? content : undefined;
}

export async function savePersonalContextContent({
  userId,
  content,
}: {
  userId: string;
  content: string;
}) {
  return dbUpsertPersonalContent({
    userId,
    content: content.slice(0, PERSONAL_CONTEXT_MAX_CHARS).trim(),
  });
}

/**
 * The identity and gating information every personal context mutation needs.
 * Kept as explicit fields because `requireAuth()` returns user and federal state separately.
 */
export type PersonalContextActor = {
  userId: string;
  userRole: UserRole;
  featureToggles: FederalStateFeatureToggles;
};

function requirePersonalContextAvailable({ userRole, featureToggles }: PersonalContextActor) {
  if (!isPersonalContextAvailable({ featureToggles, userRole })) {
    throw new ForbiddenError('Personal context is not enabled for this user');
  }
}

export async function getPersonalContextForUser({ actor }: { actor: PersonalContextActor }) {
  requirePersonalContextAvailable(actor);

  const personalContext = await dbGetPersonalContextByUserId({ userId: actor.userId });

  return {
    content: personalContext?.content ?? '',
    enabled: personalContext?.enabled ?? true,
    autoUpdateEnabled: personalContext?.autoUpdateEnabled ?? true,
    updatedAt: personalContext?.updatedAt ?? null,
  };
}

export async function updatePersonalContextForUser({
  actor,
  content,
}: {
  actor: PersonalContextActor;
  content: string;
}) {
  requirePersonalContextAvailable(actor);

  return savePersonalContextContent({ userId: actor.userId, content });
}

export async function setPersonalContextEnabledForUser({
  actor,
  enabled,
}: {
  actor: PersonalContextActor;
  enabled: boolean;
}) {
  requirePersonalContextAvailable(actor);

  return dbSetPersonalContextEnabled({ userId: actor.userId, enabled });
}

export async function setPersonalContextAutoUpdateEnabledForUser({
  actor,
  enabled,
}: {
  actor: PersonalContextActor;
  enabled: boolean;
}) {
  requirePersonalContextAvailable(actor);

  return dbSetPersonalContextAutoUpdateEnabled({ userId: actor.userId, enabled });
}

export async function setConversationPersonalContextForUser({
  actor,
  conversationId,
  enabled,
}: {
  actor: PersonalContextActor;
  conversationId: string;
  enabled: boolean | null;
}) {
  requirePersonalContextAvailable(actor);

  const conversation = await dbSetConversationPersonalContextEnabled({
    conversationId,
    userId: actor.userId,
    enabled,
  });

  if (conversation === undefined) {
    throw new NotFoundError('Conversation not found');
  }

  return conversation;
}
