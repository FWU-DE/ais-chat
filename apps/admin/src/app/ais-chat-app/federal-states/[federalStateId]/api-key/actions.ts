'use server';

import { dbGetAllApiKeys } from '@ais-chat/api-database';
import { updateApiKeyId } from '@shared/federal-states/federal-state-service';
import type { FederalStateModel } from '@shared/federal-states/types';
import { z } from 'zod';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function getApiKeyOptionsAction() {
  await requireAdminAuth();

  return dbGetAllApiKeys();
}

export async function updateApiKeyIdAction(
  federalStateId: string,
  apiKeyId: string,
): Promise<FederalStateModel> {
  await requireAdminAuth();

  return updateApiKeyId(federalStateId, z.uuid().parse(apiKeyId));
}
