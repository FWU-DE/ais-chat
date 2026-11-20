import { toolCallCostSelectSchema, toolCallNameSchema } from '@shared/db/schema';
import z from 'zod';

export const toolCallCostSchema = toolCallCostSelectSchema;
export type ToolCallCost = z.infer<typeof toolCallCostSchema>;

const costsInCentSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const normalizedValue = typeof value === 'string' ? value.trim() : value;

  if (normalizedValue === '') {
    ctx.addIssue({
      code: 'custom',
      message: 'Bitte geben Sie einen Preis in Cent ein.',
    });
    return z.NEVER;
  }

  const parsedValue =
    typeof normalizedValue === 'number' ? normalizedValue : Number(normalizedValue);

  if (!Number.isFinite(parsedValue)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Bitte geben Sie einen gültigen Preis ab 0 Cent ein.',
    });
    return z.NEVER;
  }

  if (parsedValue < 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Bitte geben Sie einen Wert ab 0 Cent ein.',
    });
    return z.NEVER;
  }

  return parsedValue;
});

export const updateToolCallCostSchema = z.object({
  toolCallName: toolCallNameSchema,
  costsInCent: costsInCentSchema,
});
export type UpdateToolCallCostInput = z.infer<typeof updateToolCallCostSchema>;
export type UpdateToolCallCostPayload = z.input<typeof updateToolCallCostSchema>;
