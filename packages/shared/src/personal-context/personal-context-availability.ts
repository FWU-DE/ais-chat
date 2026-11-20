import type {
  AssistantSelectModel,
  CharacterSelectModel,
  ConversationSelectModel,
  FederalStateFeatureToggles,
  LearningScenarioSelectModel,
  UserRole,
} from '../db/schema';

/**
 * Whether the personal context feature is available to this user at all.
 * Gated per federal state and restricted to teachers.
 */
export function isPersonalContextAvailable({
  featureToggles,
  userRole,
}: {
  featureToggles: FederalStateFeatureToggles;
  userRole: UserRole;
}): boolean {
  return (featureToggles.isPersonalContextEnabled ?? false) && userRole === 'teacher';
}

/**
 * Resolves whether the personal context should be used for a specific chat.
 *
 * Characters and learning scenarios never receive it: characters are role-play
 * personas that personal facts would break, and learning scenarios are shared
 * anonymously with students.
 */
export function resolvePersonalContextEnabled({
  featureToggles,
  userRole,
  conversation,
  assistant,
  character,
  learningScenario,
}: {
  featureToggles: FederalStateFeatureToggles;
  userRole: UserRole;
  conversation?: Pick<ConversationSelectModel, 'personalContextEnabled'> | undefined;
  assistant?: Pick<AssistantSelectModel, 'isPersonalContextEnabled'> | undefined;
  character?: CharacterSelectModel | undefined;
  learningScenario?: LearningScenarioSelectModel | undefined;
}): boolean {
  if (!isPersonalContextAvailable({ featureToggles, userRole })) {
    return false;
  }

  if (character !== undefined || learningScenario !== undefined) {
    return false;
  }

  // An explicit per-chat choice always wins over the mode default
  const conversationOverride = conversation?.personalContextEnabled;

  if (typeof conversationOverride === 'boolean') {
    return conversationOverride;
  }

  if (assistant !== undefined) {
    return assistant.isPersonalContextEnabled;
  }

  return true;
}
