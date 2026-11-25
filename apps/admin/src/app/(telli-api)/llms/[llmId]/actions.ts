'use server';

import { runServerAction } from '@shared/actions/run-server-action';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import type { LlmModelInput } from '@/services/llm-service';
import {
  createLargeLanguageModel,
  deleteLargeLanguageModel,
  updateLargeLanguageModel,
} from '@/services/llm-service';
import {
  getLlmApiKeyAssignmentsData,
  saveApiKeysForModel,
} from '@/services/model-api-key-mapping-service';

export async function createLLMAction(data: LlmModelInput) {
  await requireAdminAuth();
  return runServerAction('createLLMAction', createLargeLanguageModel)(data);
}

export async function updateLLMAction(llmId: string, data: LlmModelInput) {
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
