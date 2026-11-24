import {
  configureCharacter,
  createCharacter,
  deleteCharacterFromDetailPage,
} from '../../utils/character';
import { defineTemplateAuthorshipTests } from '../../utils/template-authorship';

defineTemplateAuthorshipTests({
  title: 'character',
  label: 'character',
  listPath: '/characters',
  deleteToast: 'Der Dialogpartner wurde erfolgreich gelöscht.',
  create: createCharacter,
  configure: (page, name) => configureCharacter(page, { name }),
  deleteFromDetailPage: deleteCharacterFromDetailPage,
});
