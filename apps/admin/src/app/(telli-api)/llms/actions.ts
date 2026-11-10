'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import { getLargeLanguageModels } from '@/services/llm-service';

export async function getLargeLanguageModelsAction() {
  await requireAdminAuth();

  return getLargeLanguageModels();
}
