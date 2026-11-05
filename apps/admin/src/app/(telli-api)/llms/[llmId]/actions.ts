'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  createLargeLanguageModel,
  deleteLargeLanguageModel,
  updateLargeLanguageModel,
} from '@/services/llm-service';
import {
  getLlmApiKeyAssignmentsData,
  saveApiKeysForModel,
} from '@/services/model-api-key-mapping-service';
import { CreateLargeLanguageModel, UpdateLargeLanguageModel } from '@/types/large-language-model';
import { runServerAction } from '@shared/actions/run-server-action';

export async function createLLMAction(data: CreateLargeLanguageModel) {
  await requireAdminAuth();
  return runServerAction('createLLMAction', createLargeLanguageModel)(data);
}

export async function updateLLMAction(llmId: string, data: UpdateLargeLanguageModel) {
  await requireAdminAuth();
  return runServerAction('updateLLMAction', updateLargeLanguageModel)(llmId, data);
}

export async function deleteLLMAction(modelId: string) {
  await requireAdminAuth();
  return runServerAction('deleteLLMAction', deleteLargeLanguageModel)(modelId);
}

export async function getLlmApiKeyAssignmentsDataAction(modelId: string) {
  await requireAdminAuth();
  return runServerAction('getLlmApiKeyAssignmentsDataAction', getLlmApiKeyAssignmentsData)(modelId);
}

export async function saveApiKeysForModelAction(modelId: string, apiKeyIds: string[]) {
  await requireAdminAuth();
  return runServerAction('saveApiKeysForModelAction', saveApiKeysForModel)(modelId, apiKeyIds);
}
