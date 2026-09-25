import {
  assertEntityType,
  EntityType,
  throwEntityInvalidArgumentError,
} from '@shared/entities/entity-types';

/**
 * Hints: You get the host in server components and server actions via the request headers.
 *
 * @example const host = (await headers()).get('host') ?? '';
 */
export function buildChatBotEntityUrl(entityType: EntityType, entityId: string, host: string) {
  const normalizedHost = host.toLowerCase();
  const chatBotAppBaseUrl = (() => {
    switch (true) {
      case normalizedHost.startsWith('localhost'):
      case normalizedHost.startsWith('127.0.0.1'):
        return 'http://localhost:3000';
      case normalizedHost.includes('staging'):
        return 'https://app-staging.ais-chat.schule';
      default:
        return 'https://app.ais-chat.schule';
    }
  })();

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

  return new URL(chatBotEntityPath, chatBotAppBaseUrl).toString();
}
