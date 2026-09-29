import {
  assertEntityType,
  EntityType,
  throwEntityInvalidArgumentError,
} from '@shared/entities/entity-types';
import { env } from '@/env';

export function buildChatBotEntityUrl(entityType: EntityType, entityId: string) {
  const chatBotEntityPath = (() => {
    assertEntityType(entityType);

    switch (entityType) {
      case 'assistant':
        return `/assistants/${entityId}`;
      case 'character':
        return `/characters/${entityId}`;
      case 'learningScenario':
        return `/learning-scenarios/${entityId}`;
      default:
        throwEntityInvalidArgumentError();
    }
  })();

  return new URL(chatBotEntityPath, env.chatBotBaseUrl).toString();
}
