import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

import { conversationMessageTable, conversationTable, userTable } from './schema';
export type User = typeof userTable.$inferSelect;

export type ConversationModel = typeof conversationTable.$inferSelect;
export type InsertConversationModel = typeof conversationTable.$inferInsert;

export type ConversationMessageModel = typeof conversationMessageTable.$inferSelect;
export type InsertConversationMessageModel = typeof conversationMessageTable.$inferInsert;

export type CustomTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
};

export type WebSource = {
  name?: string;
  link: string;
  content?: string;
  error?: boolean;
};

export type DbTransactionObject = PgTransaction<
  PostgresJsQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

export type PgTransactionObject = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;
