import { assertEntityType, throwEntityInvalidArgumentError } from '@shared/entities/entity-types';
import { SuspensionRequestEntityOverview } from '@shared/suspension/suspension-service';

export function mapReasonToLabel(
  reason: SuspensionRequestEntityOverview['reasons'][number]['reason'],
) {
  switch (reason) {
    case 'copyright_violation':
      return 'Urheberrechtsverletzung';
    case 'discrimination':
      return 'Diskriminierung';
    case 'false_or_outdated_information':
      return 'Falsche oder veraltete Informationen';
    case 'insufficient_sources':
      return 'Unzureichende Quellenangaben';
    case 'other':
      return 'Sonstiges';
    case 'personal_data_usage_or_query':
      return 'Nutzung oder Abfrage persönlicher Daten';
    case 'sexualized_content':
      return 'Sexualisierte Inhalte';
    case 'violence_or_extremist_content':
      return 'Gewalt / extremistische Inhalte';
    default:
      return reason;
  }
}

export function mapStatusToLabel(status: SuspensionRequestEntityOverview['status']) {
  switch (status) {
    case 'new':
      return 'neu';
    case 'suspended':
      return 'gesperrt';
    case 'checked':
      return 'geprüft';
    default:
      return status;
  }
}

export function getChatBotEntityUrl(
  entityType: SuspensionRequestEntityOverview['entityType'],
  entityId: string,
  host: string,
) {
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
