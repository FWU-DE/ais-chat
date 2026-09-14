'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  createLargeLanguageModel,
  deleteLargeLanguageModel,
  updateLargeLanguageModel,
} from '@/services/llm-service';
import { CreateLargeLanguageModel, UpdateLargeLanguageModel } from '@/types/large-language-model';
import { runServerAction } from '@shared/actions/run-server-action';

export async function createLLMAction(organizationId: string, data: CreateLargeLanguageModel) {
  await requireAdminAuth();
  return runServerAction('createLLMAction', createLargeLanguageModel)(organizationId, data);
}

export async function updateLLMAction(
  organizationId: string,
  llmId: string,
  data: UpdateLargeLanguageModel,
) {
  await requireAdminAuth();
  return runServerAction('updateLLMAction', updateLargeLanguageModel)(organizationId, llmId, data);
}

export async function deleteLLMAction(organizationId: string, modelId: string) {
  await requireAdminAuth();
  return runServerAction('deleteLLMAction', deleteLargeLanguageModel)(organizationId, modelId);
}
