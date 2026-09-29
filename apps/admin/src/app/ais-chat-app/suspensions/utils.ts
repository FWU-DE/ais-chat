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
