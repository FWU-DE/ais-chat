import {
  configureAssistant,
  createAssistant,
  deleteAssistantFromDetailPage,
} from '../../utils/assistant';
import { defineTemplateAuthorshipTests } from '../../utils/template-authorship';

defineTemplateAuthorshipTests({
  entityType: 'assistant',
  title: 'assistant',
  label: 'assistant',
  listPath: '/assistants',
  deleteToast: 'Der Assistent wurde erfolgreich gelöscht.',
  create: createAssistant,
  configure: (page, name) => configureAssistant(page, { name }),
  deleteFromDetailPage: deleteAssistantFromDetailPage,
});
