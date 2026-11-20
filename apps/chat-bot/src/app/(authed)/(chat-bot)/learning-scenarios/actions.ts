'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import {
  createNewLearningScenario,
  createNewLearningScenarioFromTemplate,
  deleteLearningScenario,
  downloadFileFromLearningScenario,
  linkFileToLearningScenario,
} from '@shared/learning-scenarios/learning-scenario-service';

import { requireAuth } from '@/auth/requireAuth';

export async function deleteLearningScenarioAction({ id }: { id: string }) {
  const { user } = await requireAuth();
  return runServerAction(
    'deleteLearningScenarioAction',
    deleteLearningScenario,
  )({
    learningScenarioId: id,
    user,
  });
}

export async function createNewLearningScenarioAction({ modelId }: { modelId: string }) {
  const { user } = await requireAuth();

  return runServerAction(
    'createNewLearningScenarioAction',
    createNewLearningScenario,
  )({
    modelId,
    user,
  });
}

export async function createNewLearningScenarioFromTemplateAction({
  templateId,
  duplicateLearningScenarioName,
}: {
  templateId: string;
  duplicateLearningScenarioName?: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'createNewLearningScenarioFromTemplateAction',
    createNewLearningScenarioFromTemplate,
  )({
    originalLearningScenarioId: templateId,
    user,
    duplicateLearningScenarioName,
  });
}

export async function linkFileToLearningScenarioAction({
  fileId,
  learningScenarioId,
}: {
  fileId: string;
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();
  return runServerAction(
    'linkFileToLearningScenarioAction',
    linkFileToLearningScenario,
  )({
    fileId,
    learningScenarioId,
    user,
  });
}

export async function downloadFileFromLearningScenarioAction({
  learningScenarioId,
  fileId,
}: {
  learningScenarioId: string;
  fileId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'downloadFileFromLearningScenarioAction',
    downloadFileFromLearningScenario,
  )({
    learningScenarioId,
    fileId,
    user,
  });
}
