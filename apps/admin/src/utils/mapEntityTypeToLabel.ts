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
