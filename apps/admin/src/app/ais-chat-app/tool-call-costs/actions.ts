'use server';

import type { ToolCallName } from '@shared/db/schema';
import type { UpdateToolCallCostInput } from '@shared/tool-call-costs/tool-call-cost';
import {
  getToolCallCostByName,
  getToolCallCosts,
  updateToolCallCost,
} from '@shared/tool-call-costs/tool-call-cost-service';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function getToolCallCostsAction() {
  await requireAdminAuth();

  return getToolCallCosts();
}

export async function getToolCallCostAction(toolCallName: ToolCallName) {
  await requireAdminAuth();

  return getToolCallCostByName(toolCallName);
}

export async function updateToolCallCostAction(input: UpdateToolCallCostInput) {
  await requireAdminAuth();

  return updateToolCallCost(input);
}
