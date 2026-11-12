'use server';

import { runServerAction } from '@shared/actions/run-server-action';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import { getProviderKeys } from '@/services/provider-key-service';

export async function getProviderKeysAction() {
  await requireAdminAuth();
  return runServerAction('getProviderKeysAction', getProviderKeys)();
}
