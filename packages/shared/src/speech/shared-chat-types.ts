import { dbGetCharacterByIdAndInviteCode } from '@shared/db/functions/character';
import { dbGetLearningScenarioByIdAndInviteCode } from '@shared/db/functions/learning-scenario';

export type SharedChatCharacter = NonNullable<
  Awaited<ReturnType<typeof dbGetCharacterByIdAndInviteCode>>
>;

export type SharedChatLearningScenario = NonNullable<
  Awaited<ReturnType<typeof dbGetLearningScenarioByIdAndInviteCode>>
>;

export type SharedChatEntity = SharedChatCharacter | SharedChatLearningScenario;

export type SharedChatEntityType = 'character' | 'learningScenario';
