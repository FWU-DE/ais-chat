import { asc, eq } from 'drizzle-orm';

import { db } from '..';
import { toolCallCostTable, type ToolCallName } from '../schema';

export async function dbGetToolCallCosts() {
  return db.select().from(toolCallCostTable).orderBy(asc(toolCallCostTable.toolCallName));
}

export async function dbGetToolCallCostByName(toolCallName: ToolCallName) {
  const [toolCallCost] = await db
    .select()
    .from(toolCallCostTable)
    .where(eq(toolCallCostTable.toolCallName, toolCallName));

  if (!toolCallCost) {
    throw new Error(`Tool call cost for ${toolCallName} not found in database`);
  }

  return toolCallCost;
}

export async function dbUpdateToolCallCost({
  toolCallName,
  costsInCent,
}: {
  toolCallName: ToolCallName;
  costsInCent: number;
}) {
  const [updatedToolCallCost] = await db
    .update(toolCallCostTable)
    .set({ costsInCent })
    .where(eq(toolCallCostTable.toolCallName, toolCallName))
    .returning();

  if (!updatedToolCallCost) {
    throw new Error(`Failed to update tool call cost for ${toolCallName} in database`);
  }

  return updatedToolCallCost;
}
