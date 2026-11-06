'use server';
import { getFederalStates } from '@shared/federal-states/federal-state-service';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function getFederalStatesAction() {
  await requireAdminAuth();

  return getFederalStates();
}
