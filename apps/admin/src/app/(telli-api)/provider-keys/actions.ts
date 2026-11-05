'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import { getProviderKeys } from '@/services/provider-key-service';
import { runServerAction } from '@shared/actions/run-server-action';

export async function getProviderKeysAction() {
  await requireAdminAuth();
  return runServerAction('getProviderKeysAction', getProviderKeys)();
}
