'use server';

import { runServerAction } from '@shared/actions/run-server-action';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  createProviderKey,
  deleteProviderKey,
  updateProviderKey,
} from '@/services/provider-key-service';
import type { SaveProviderKey } from '@/types/provider-key';

export async function createProviderKeyAction(data: SaveProviderKey) {
  await requireAdminAuth();
  return runServerAction('createProviderKeyAction', createProviderKey)(data);
}

export async function updateProviderKeyAction(providerKeyId: string, data: SaveProviderKey) {
  await requireAdminAuth();
  return runServerAction('updateProviderKeyAction', updateProviderKey)(providerKeyId, data);
}

export async function deleteProviderKeyAction(providerKeyId: string) {
  await requireAdminAuth();
  return runServerAction('deleteProviderKeyAction', deleteProviderKey)(providerKeyId);
}
