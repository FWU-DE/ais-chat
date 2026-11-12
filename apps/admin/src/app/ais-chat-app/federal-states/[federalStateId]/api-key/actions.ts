'use server';

import { updateApiKey } from '@shared/federal-states/federal-state-service';
import type { FederalStateModel } from '@shared/federal-states/types';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function updateApiKeyAction(
  federalStateId: string,
  decryptedApiKey: string,
): Promise<FederalStateModel> {
  await requireAdminAuth();
  return updateApiKey(federalStateId, decryptedApiKey);
}
