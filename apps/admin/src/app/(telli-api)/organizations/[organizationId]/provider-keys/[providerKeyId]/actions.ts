'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  createProviderKey,
  deleteProviderKey,
  updateProviderKey,
} from '@/services/provider-key-service';
import type { SaveProviderKey } from '@/types/provider-key';
import { runServerAction } from '@shared/actions/run-server-action';

export async function createProviderKeyAction(organizationId: string, data: SaveProviderKey) {
  await requireAdminAuth();
  return runServerAction('createProviderKeyAction', createProviderKey)(organizationId, data);
}

export async function updateProviderKeyAction(
  organizationId: string,
  providerKeyId: string,
  data: SaveProviderKey,
) {
  await requireAdminAuth();
  return runServerAction('updateProviderKeyAction', updateProviderKey)(
    organizationId,
    providerKeyId,
    data,
  );
}

export async function deleteProviderKeyAction(organizationId: string, providerKeyId: string) {
  await requireAdminAuth();
  return runServerAction('deleteProviderKeyAction', deleteProviderKey)(
    organizationId,
    providerKeyId,
  );
}
