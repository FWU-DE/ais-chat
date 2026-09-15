import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ImageGenerationConfig, LlmModelPriceMetadata } from './types';
import { LlmModelProviderSettings, LlmProviderKeySettings } from './llm-model';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

export const organizationTable = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});
export type OrganizationInsertModel = typeof organizationTable.$inferInsert;
export type OrganizationModel = typeof organizationTable.$inferSelect;

export const projectTable = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    organizationId: uuid('organization_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.organizationId)],
);
export const projectInsertSchema = createInsertSchema(projectTable);
export type ProjectInsertModel = typeof projectTable.$inferInsert;
export type ProjectModel = typeof projectTable.$inferSelect;
export const projectUpdateSchema = createUpdateSchema(projectTable);

export const llmModelTable = pgTable(
  'llm_model',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull().default('bifrost'),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull().default(''),
    setting: json('settings').$type<LlmModelProviderSettings>().notNull(),
    useBifrost: boolean('use_bifrost').notNull().default(true),
    priceMetadata: json('price_metada').$type<LlmModelPriceMetadata>().notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizationTable.id)
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    supportedImageFormats: json('supported_image_formats').$type<string[]>().notNull().default([]),
    imageGenerationConfig: jsonb('image_generation_config').$type<ImageGenerationConfig>(),
    additionalParameters: json('additional_parameters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isNew: boolean('is_new').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    safetyFilterEnabled: boolean('safety_filter_enabled').notNull().default(true),
  },
  (table) => [index().on(table.organizationId)],
);
export const llmInsertModelSchema = createInsertSchema(llmModelTable);
export const llmUpdateModelSchema = createUpdateSchema(llmModelTable).omit({
  id: true,
  organizationId: true,
  createdAt: true,
});
export type LlmInsertModel = typeof llmModelTable.$inferInsert;
export type LlmModel = typeof llmModelTable.$inferSelect;

export const llmProviderKeyTable = pgTable(
  'llm_provider_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    settings: json('settings').$type<LlmProviderKeySettings>().notNull(),
    weight: doublePrecision('weight').notNull().default(1),
    isEnabled: boolean('is_enabled').notNull().default(true),
    organizationId: uuid('organization_id')
      .references(() => organizationTable.id)
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.organizationId),
    uniqueIndex('llm_provider_key_organization_id_name_unique').on(
      table.organizationId,
      table.name,
    ),
  ],
);
export const llmProviderKeyInsertSchema = createInsertSchema(llmProviderKeyTable);
export const llmProviderKeyUpdateSchema = createUpdateSchema(llmProviderKeyTable).omit({
  id: true,
  organizationId: true,
  createdAt: true,
});
export type LlmProviderKeyInsertModel = typeof llmProviderKeyTable.$inferInsert;
export type LlmProviderKeyModel = typeof llmProviderKeyTable.$inferSelect;

export const llmModelProviderKeyMappingTable = pgTable(
  'llm_model_provider_key_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    llmModelId: uuid('llm_model_id')
      .notNull()
      .references(() => llmModelTable.id),
    providerKeyId: uuid('provider_key_id')
      .notNull()
      .references(() => llmProviderKeyTable.id),
    upstreamModelName: text('upstream_model_name').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.llmModelId),
    index().on(table.providerKeyId),
    uniqueIndex('llm_model_provider_key_mapping_model_key_unique').on(
      table.llmModelId,
      table.providerKeyId,
    ),
  ],
);
export const llmModelProviderKeyMappingInsertSchema = createInsertSchema(
  llmModelProviderKeyMappingTable,
);
export type LlmModelProviderKeyMappingModel = typeof llmModelProviderKeyMappingTable.$inferSelect;

export const apiKeyStateEnum = pgEnum('api_key_state', ['active', 'inactive', 'deleted']);

export const apiKeyTable = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    keyId: text('key_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projectTable.id),
    state: apiKeyStateEnum('state').notNull().default('active'),
    limitInCent: integer('limit_in_cent').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expiresAt', { mode: 'date' }),
  },
  (table) => [index().on(table.projectId), index().on(table.keyId)],
);
export type ApiKeyInsertModel = typeof apiKeyTable.$inferInsert;
export type ApiKeyModel = typeof apiKeyTable.$inferSelect;
export const apiKeyInsertSchema = createInsertSchema(apiKeyTable);
export const apiKeyUpdateSchema = createUpdateSchema(apiKeyTable);

export const llmModelApiKeyMappingTable = pgTable(
  'llm_model_api_key_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    llmModelId: uuid('llm_model_id')
      .notNull()
      .references(() => llmModelTable.id),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeyTable.id),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.llmModelId), index().on(table.apiKeyId)],
);

export type LlmModelApiKeyMappingModel = typeof llmModelApiKeyMappingTable.$inferSelect;
export const llmModelApiKeyMappingInsertSchema = createInsertSchema(llmModelApiKeyMappingTable);

export const completionUsageTrackingTable = pgTable(
  'completion_usage_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    completionTokens: integer('completion_tokens').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
    modelId: uuid('model_id')
      .references(() => llmModelTable.id)
      .notNull(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeyTable.id),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.apiKeyId, table.createdAt)],
);
export type CompletionUsageInsertModel = typeof completionUsageTrackingTable.$inferInsert;
export type CompletionUsageModel = typeof completionUsageTrackingTable.$inferSelect;

export const imageGenerationUsageTrackingTable = pgTable(
  'image_generation_usage_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
    modelId: uuid('model_id')
      .references(() => llmModelTable.id)
      .notNull(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeyTable.id),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.apiKeyId, table.createdAt)],
);
export type ImageGenerationUsageInsertModel = typeof imageGenerationUsageTrackingTable.$inferInsert;
export type ImageGenerationUsageModel = typeof imageGenerationUsageTrackingTable.$inferSelect;

export const adminTable = pgTable('admin', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});
export type AdminInsertModel = typeof completionUsageTrackingTable.$inferInsert;
export type AdminModel = typeof completionUsageTrackingTable.$inferSelect;
