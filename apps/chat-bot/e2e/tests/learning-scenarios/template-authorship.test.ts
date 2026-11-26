import {
  configureLearningScenario,
  createLearningScenario,
  deleteLearningScenarioFromDetailPage,
} from '../../utils/learning-scenario';
import { defineTemplateAuthorshipTests } from '../../utils/template-authorship';

defineTemplateAuthorshipTests({
  entityType: 'learningScenario',
  title: 'learning scenario',
  label: 'scenario',
  listPath: '/learning-scenarios',
  deleteToast: 'Das Lernszenario wurde erfolgreich gelöscht.',
  create: createLearningScenario,
  configure: (page, name) =>
    configureLearningScenario(page, {
      name,
      description: 'Authorship test description',
      additionalInstructions: 'Authorship test instructions',
      studentExercise: 'Authorship test exercise',
    }),
  deleteFromDetailPage: deleteLearningScenarioFromDetailPage,
});
