import {
  dbGetToolCallCostByName,
  dbGetToolCallCosts,
  dbUpdateToolCallCost,
} from '@shared/db/functions/tool-call';
import { type ToolCallName } from '@shared/db/schema';

import {
  type ToolCallCost,
  type UpdateToolCallCostInput,
  updateToolCallCostSchema,
} from './tool-call-cost';

export async function getToolCallCosts(): Promise<ToolCallCost[]> {
  return dbGetToolCallCosts();
}

export async function getToolCallCostByName(toolCallName: ToolCallName): Promise<ToolCallCost> {
  return dbGetToolCallCostByName(toolCallName);
}

export async function updateToolCallCost(input: UpdateToolCallCostInput): Promise<ToolCallCost> {
  const values = updateToolCallCostSchema.parse(input);

  return dbUpdateToolCallCost(values);
}
