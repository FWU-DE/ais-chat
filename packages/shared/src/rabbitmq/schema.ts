import { z } from 'zod';

export const NewChatMessageEventSchema = z.object({
  event_type: z.literal('new_chat_message'),
  pseudonym_id: z.string(),
  chat_id: z.string(),
  input_tokens: z.coerce.number(),
  output_tokens: z.coerce.number(),
  federal_state: z.string(),
  provider: z.string(),
  model_name: z.string(),
  cost_in_cent: z.coerce.number(),
  school_id: z.string(),
  user_role: z.string(),
  chat_type: z.string(),
  timestamp: z.coerce.date(),
});
export type NewChatMessageEventType = z.infer<typeof NewChatMessageEventSchema>;

export const MonthlyTokenBudgetExceededEventSchema = z.object({
  event_type: z.literal('monthly_token_budget_exceeded'),
  pseudonym_id: z.string(),
  federal_state: z.string(),
  school_id: z.string(),
  user_role: z.string(),
  timestamp: z.coerce.date(),
});
export type MonthlyTokenBudgetExceededEventType = z.infer<
  typeof MonthlyTokenBudgetExceededEventSchema
>;
