import {
  insertTemplateAssistant,
  insertTemplateCharacters,
  insertTemplateLearningScenarios,
} from './default-templates';
import { insertFederalStates } from './federal-state';
import { insertHelpModeGpt } from './help-mode';
import { initializeStaticModelConfigurations } from './static-model-configuration';
import { insertDummyUser } from './user-entity';

async function add() {
  await insertFederalStates({ skip: false });
  await initializeStaticModelConfigurations();
  await insertDummyUser();
  await Promise.all([
    insertHelpModeGpt({ skip: false }),
    insertTemplateCharacters(),
    insertTemplateAssistant(),
    insertTemplateLearningScenarios(),
  ]);
}

add()
  .then(() => {
    console.log('Seeding ais.chat db completed');
  })
  .catch((error) => {
    console.log('Seeding ais.chat db failed', error);
    process.exit(1);
  });
