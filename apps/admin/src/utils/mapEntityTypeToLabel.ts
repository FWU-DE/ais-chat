import { EntityType, throwEntityInvalidArgumentError } from '@shared/entities/entity-types';

export function mapEntityTypeToLabel(entityType: EntityType): string {
  switch (entityType) {
    case 'character':
      return 'Dialogpartner';
    case 'assistant':
      return 'Assistent';
    case 'learningScenario':
      return 'Lernszenario';
    default:
      throwEntityInvalidArgumentError();
  }
}

export function mapEntityTypeToAbbreviation(entityType: EntityType): string {
  switch (entityType) {
    case 'character':
      return 'DP';
    case 'assistant':
      return 'AS';
    case 'learningScenario':
      return 'LS';
    default:
      throwEntityInvalidArgumentError();
  }
}
