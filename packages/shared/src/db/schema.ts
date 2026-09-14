import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  conversationRoleSchema,
  conversationTypeSchema,
  imageAspectRatioPresetSchema,
  imageStyleTypeSchema,
} from '../utils/chat';

export type DesignConfiguration = {
  primaryColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  secondaryTextColor: string;
};

export const llmModelPriceMetadataSchema = z.union([
  z.object({
    type: z.literal('text'),
    completionTokenPrice: z.number(),
    promptTokenPrice: z.number(),
  }),
  z.object({
    type: z.literal('image'),
    pricePerImageInCent: z.number(),
  }),
  z.object({
    type: z.literal('image'),
    inputTextTokenPrice: z.number(),
    outputTextTokenPrice: z.number().optional(),
    outputImageTokenPrice: z.number(),
  }),
  z.object({
    type: z.literal('embedding'),
    promptTokenPrice: z.number(),
  }),
]);

export type LlmModelPriceMetadata = z.infer<typeof llmModelPriceMetadataSchema>;

import { isNull, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { ToolCall } from '@ais-chat/ai-core/chat/types';
import { logError } from '@shared/logging';

// can be expanded to include other metadata of other file types
export type FileMetadata = Record<string, unknown>;

export const userRoleSchema = z.enum(['student', 'teacher']);
export const userRoleEnum = pgEnum('user_school_role', userRoleSchema.enum);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Schema for table user_entity
 */
export const userTable = pgTable('user_entity', {
  id: uuid('id').defaultRandom().primaryKey(),
  lastUsedModel: text('last_used_model'),
  versionAcceptedConditions: integer(),
  schoolIds: text('school_ids')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  federalStateId: text('federal_state_id').references(() => federalStateTable.id),
  userRole: userRoleEnum('user_role').notNull().default('student'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const userSelectSchema = createSelectSchema(userTable).extend({
  createdAt: z.coerce.date(),
});
export const userInsertSchema = createInsertSchema(userTable).omit({ createdAt: true, id: true });
export const userUpdateSchema = createUpdateSchema(userTable).omit({ createdAt: true }).extend({
  id: z.string(),
});

export type UserSelectModel = z.infer<typeof userSelectSchema>;
export type UserInsertModel = z.infer<typeof userInsertSchema>;
export type UserUpdateModel = z.infer<typeof userUpdateSchema>;

/**
 * Schema for table conversation
 */
export const conversationTypeEnum = pgEnum('conversation_type', conversationTypeSchema.enum);
export const conversationTable = pgTable(
  'conversation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name'),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    characterId: uuid('character_id').references(() => characterTable.id, { onDelete: 'cascade' }),
    learningScenarioId: uuid('learning_scenario_id').references(() => learningScenarioTable.id, {
      onDelete: 'cascade',
    }),
    assistantId: uuid('assistant_id').references(() => assistantTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    type: conversationTypeEnum('type').notNull().default('chat'),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.characterId),
    index().on(table.learningScenarioId),
    index().on(table.assistantId),
    index().on(table.userId, table.createdAt.desc()).where(isNull(table.deletedAt)),
  ],
);

export const conversationSelectSchema = createSelectSchema(conversationTable);
export const conversationInsertSchema = createInsertSchema(conversationTable).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export const conversationUpdateSchema = createUpdateSchema(conversationTable)
  .omit({
    createdAt: true,
  })
  .extend({
    id: z.string(),
  });

export type ConversationSelectModel = z.infer<typeof conversationSelectSchema>;
export type ConversationInsertModel = z.infer<typeof conversationInsertSchema>;
export type ConversationUpdateModel = z.infer<typeof conversationUpdateSchema>;

export type ConversationModelWithFiles = ConversationSelectModel & {
  files: FileModel[];
};

/**
 * Schema for table conversation_message
 */
export const conversationRoleEnum = pgEnum('conversation_role', conversationRoleSchema.enum);

// Define the parameters type for conversation messages
export const conversationMessageParametersSchema = z.object({
  imageStyle: imageStyleTypeSchema.optional(),
  aspectRatio: imageAspectRatioPresetSchema.optional(),
});

export type ConversationMessageParameters = z.infer<typeof conversationMessageParametersSchema>;

type ConversationMessageWebSearchResult = {
  type: 'text';
  name: string;
  url: string;
  content: string;
  favicon: string;
};

export const conversationMessageTable = pgTable(
  'conversation_message',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    content: text('content').notNull(),
    conversationId: uuid('conversation_id')
      .references(() => conversationTable.id, { onDelete: 'cascade' })
      .notNull(),
    modelName: text('model_name').notNull(),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    role: conversationRoleEnum('role').notNull(),
    orderNumber: integer('order_number').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    parameters: json('parameters').$type<ConversationMessageParameters>(),
    webSearchResults: json('web_search_results').$type<ConversationMessageWebSearchResult[]>(),
    toolCalls: json('tool_calls').$type<ToolCall[]>(),
    toolCallId: text('tool_call_id'),
  },
  (table) => [
    index().on(table.conversationId),
    index().on(table.userId),
    uniqueIndex('conversation_message_conversation_id_order_number_unique')
      .on(table.conversationId, table.orderNumber)
      .where(isNull(table.deletedAt)),
  ],
);

export const conversationMessageSelectSchema = createSelectSchema(conversationMessageTable);
export const conversationMessageInsertSchema = createInsertSchema(conversationMessageTable).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export const conversationMessageUpdateSchema = createUpdateSchema(conversationMessageTable)
  .omit({
    createdAt: true,
    conversationId: true,
    userId: true,
  })
  .extend({
    id: z.string(),
  });

export type ConversationMessageSelectModel = z.infer<typeof conversationMessageSelectSchema>;
export type ConversationMessageInsertModel = z.infer<typeof conversationMessageInsertSchema>;
export type ConversationMessageUpdateModel = z.infer<typeof conversationMessageUpdateSchema>;
export type WebSearchResult = ConversationMessageWebSearchResult;

/**
 * Schema for table federal_state
 */
export const federalStateFeatureTogglesSchema = z.object({
  isStudentAccessEnabled: z.boolean().default(true),
  isCharacterEnabled: z.boolean().default(true),
  isSharedChatEnabled: z.boolean().default(true),
  isCustomGptEnabled: z.boolean().default(true),
  isShareTemplateWithSchoolEnabled: z.boolean().default(true),
  isSharedPageLocaleDetectionEnabled: z.boolean().optional(),
  isImageGenerationEnabled: z.boolean().optional(),
  isWebSearchEnabled: z.boolean().optional(),
  isCalculatorEnabled: z.boolean().optional(),
});
export type FederalStateFeatureToggles = z.infer<typeof federalStateFeatureTogglesSchema>;

export const federalStatePictureUrlsSchema = z.object({
  logo: z.string().optional(),
  favicon: z.string().optional(),
});
export type FederalStatePictureUrls = z.infer<typeof federalStatePictureUrlsSchema>;

export const federalStateTable = pgTable('federal_state', {
  id: text('id').primaryKey(),
  teacherPriceLimit: integer('teacher_price_limit').notNull().default(500),
  studentPriceLimit: integer('student_price_limit').notNull().default(200),
  encryptedApiKey: text('encrypted_api_key'), // This will stay until we have migrated all usages to apiKeyId
  apiKeyId: uuid('api_key_id'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  // vidis things
  mandatoryCertificationTeacher: boolean('mandatory_certification_teacher').default(false),
  chatStorageTime: integer('chat_storage_time').notNull().default(120),
  supportContacts: json('support_contacts').$type<string[]>(),
  trainingLink: text('training_link'),
  // whitelabel configuration
  designConfiguration: json('design_configuration').$type<DesignConfiguration>(),
  appName: text('app_name'),
  pictureUrls: json('picture_urls').$type<FederalStatePictureUrls>(),
  // feature toggles
  featureToggles: json('feature_toggles').$type<FederalStateFeatureToggles>().notNull(),
});
export const federalStateSelectSchema = createSelectSchema(federalStateTable).extend({
  id: z.string(),
  createdAt: z.coerce.date(),
});
export const federalStateInsertSchema = createInsertSchema(federalStateTable)
  .extend({
    featureToggles: federalStateFeatureTogglesSchema,
  })
  .omit({ createdAt: true });
export const federalStateUpdateSchema = createUpdateSchema(federalStateTable)
  .omit({
    createdAt: true,
  })
  .extend({
    id: z.string(),
  });

export type FederalStateSelectModel = z.infer<typeof federalStateSelectSchema>;
export type FederalStateInsertModel = z.infer<typeof federalStateInsertSchema>;
export type FederalStateUpdateModel = z.infer<typeof federalStateUpdateSchema>;

/**
 * Schema for table info_banner
 */
export const infoBannerTypeSchema = z.enum(['warning', 'info']);
export const infoBannerTypeEnum = pgEnum('info_banner_type', infoBannerTypeSchema.enum);
export type InfoBannerType = z.infer<typeof infoBannerTypeSchema>;

export const infoBannerTable = pgTable(
  'info_banner',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: infoBannerTypeEnum('type').notNull(),
    message: text('message').notNull(),
    buttonLabel: text('button_label'),
    buttonUrl: text('button_url'),
    startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp('ends_at', { mode: 'date', withTimezone: true }).notNull(),
    maxLoginCount: integer('max_login_count'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
    isDeleted: boolean('is_deleted').notNull().default(false),
  },
  (table) => [index().on(table.startsAt), index().on(table.endsAt), index().on(table.isDeleted)],
);

export const infoBannerSelectSchema = createSelectSchema(infoBannerTable).extend({
  type: infoBannerTypeSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export const infoBannerInsertSchema = createInsertSchema(infoBannerTable)
  .extend({
    type: infoBannerTypeSchema,
  })
  .omit({ id: true, createdAt: true, updatedAt: true, isDeleted: true });
export const infoBannerUpdateSchema = createUpdateSchema(infoBannerTable)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string(),
    type: infoBannerTypeSchema,
  });

export type InfoBannerSelectModel = z.infer<typeof infoBannerSelectSchema>;
export type InfoBannerInsertModel = z.infer<typeof infoBannerInsertSchema>;
export type InfoBannerUpdateModel = z.infer<typeof infoBannerUpdateSchema>;

/**
 * Schema for table info_banner_federal_state_mapping
 */
export const infoBannerFederalStateMappingTable = pgTable(
  'info_banner_federal_state_mapping',
  {
    infoBannerId: uuid('info_banner_id')
      .notNull()
      .references(() => infoBannerTable.id, { onDelete: 'cascade' }),
    federalStateId: text('federal_state_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.infoBannerId, table.federalStateId] }),
    foreignKey({
      columns: [table.federalStateId],
      foreignColumns: [federalStateTable.id],
      name: 'info_banner_mapping_federal_state_id_fk',
    }).onDelete('cascade'),
    index().on(table.federalStateId),
  ],
);

export const infoBannerFederalStateMappingSelectSchema = createSelectSchema(
  infoBannerFederalStateMappingTable,
);
export const infoBannerFederalStateMappingInsertSchema = createInsertSchema(
  infoBannerFederalStateMappingTable,
);

export type InfoBannerFederalStateMappingSelectModel = z.infer<
  typeof infoBannerFederalStateMappingSelectSchema
>;
export type InfoBannerFederalStateMappingInsertModel = z.infer<
  typeof infoBannerFederalStateMappingInsertSchema
>;

/**
 * Schema for table info_banner_user_state
 */
export const infoBannerUserStateTable = pgTable(
  'info_banner_user_state',
  {
    infoBannerId: uuid('info_banner_id')
      .notNull()
      .references(() => infoBannerTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    loginCount: integer('login_count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.infoBannerId, table.userId] }),
    index().on(table.userId),
  ],
);

export const infoBannerUserStateSelectSchema = createSelectSchema(infoBannerUserStateTable);
export const infoBannerUserStateInsertSchema = createInsertSchema(infoBannerUserStateTable);

export type InfoBannerUserStateSelectModel = z.infer<typeof infoBannerUserStateSelectSchema>;
export type InfoBannerUserStateInsertModel = z.infer<typeof infoBannerUserStateInsertSchema>;

/**
 * Schema for table character
 */
export const accessLevelSchema = z.enum(['private', 'school', 'community', 'global']);
export const accessLevelEnum = pgEnum('access_level', accessLevelSchema.enum);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const webSearchScopeSchema = z.enum(['all-web', 'included-domains']);
export const webSearchScopeEnum = pgEnum('web_search_scope', webSearchScopeSchema.enum);
export type WebSearchScope = z.infer<typeof webSearchScopeSchema>;

export type WebSearchModel = {
  isWebSearchEnabled: boolean;
  webSearchScope: WebSearchScope;
  webSearchIncludedDomains: string[];
};

export const webSearchIncludedDomainsSchema = z.array(z.string());

export const suspensionRequestReasonSchema = z.enum([
  'copyright_violation',
  'false_or_outdated_information',
  'insufficient_sources',
  'discrimination',
  'personal_data_usage_or_query',
  'violence_or_extremist_content',
  'sexualized_content',
  'other',
]);
export const suspensionRequestReasonEnum = pgEnum(
  'suspension_request_reason',
  suspensionRequestReasonSchema.enum,
);
export type SuspensionRequestReason = z.infer<typeof suspensionRequestReasonSchema>;

// Filter attribute enums have to match with translation keys in de.json
export const schoolTypesSchema = z.enum([
  'elementary-school',
  'special-needs-school',
  'middle-school',
  'secondary-school',
  'grammar-school',
  'comprehensive-school',
  'vocational-school',
  'technical-college',
  'other',
]);
export type SchoolType = z.infer<typeof schoolTypesSchema>;

export const gradeRangesSchema = z.enum(['range-1', 'range-2', 'range-3', 'range-4']);
export type GradeRange = z.infer<typeof gradeRangesSchema>;

export const categoriesSchema = z.enum([
  'artificial-intelligence',
  'writing',
  'projects',
  'coaching',
  'organisation',
  'feedback',
  'conversation',
  'historical-figures',
  'experts',
  'lesson-planning',
  'school-development',
  'teaching-material',
]);
export type Category = z.infer<typeof categoriesSchema>;

export const federalStatesSchema = z.enum([
  'baden-wuerttemberg',
  'bavaria',
  'berlin',
  'brandenburg',
  'bremen',
  'hamburg',
  'hesse',
  'mecklenburg-western-pomerania',
  'lower-saxony',
  'northrhine-westphalia',
  'rhineland-palatinate',
  'saarland',
  'saxony',
  'saxony-anhalt',
  'schleswig-holstein',
  'thuringia',
]);
export type FederalState = z.infer<typeof federalStatesSchema>;

export const languagesSchema = z.enum([
  'german',
  'english',
  'arabic',
  'turkish',
  'french',
  'italian',
  'spanish',
  'greek',
  'latin',
  'russian',
]);
export type Language = z.infer<typeof languagesSchema>;

// Subject enums organized by category
export const langSubjects = z.enum([
  'german',
  'german-as-second-language',
  'english',
  'french',
  'greek',
  'italian',
  'latin',
  'russian',
  'spanish',
  'turkish',
] as const);

export const socialSciSubjects = z.enum(['geography', 'history', 'politics', 'economics'] as const);

export const artsSubjects = z.enum(['art', 'music', 'sports'] as const);

export const otherSubjects = z.enum([
  'business-studies',
  'health',
  'intercultural-education',
  'media-education',
  'education',
  'psychology',
  'addiction-prevention',
  'comprehensive-subjects',
  'traffic-education',
] as const);

export const stemSubjects = z.enum([
  'biology',
  'chemistry',
  'informatics',
  'mathematics',
  'physics',
  'social-studies',
  'environmental-studies',
] as const);

export const ethicsSubjects = z.enum(['ethics', 'philosophy', 'religion'] as const);

export const subjectsSchema = z.enum([
  ...langSubjects.options,
  ...socialSciSubjects.options,
  ...artsSubjects.options,
  ...otherSubjects.options,
  ...stemSubjects.options,
  ...ethicsSubjects.options,
] as const);
export type Subject = z.infer<typeof subjectsSchema>;

export const filterGroupSchema = z.object({
  school_types: z.array(schoolTypesSchema).optional(),
  grade_ranges: z.array(gradeRangesSchema).optional(),
  subjects: z.array(subjectsSchema).optional(),
  categories: z.array(categoriesSchema).optional(),
  federal_states: z.array(federalStatesSchema).optional(),
  languages: z.array(languagesSchema).optional(),
});
export type FilterGroup = z.infer<typeof filterGroupSchema>;

export const characterTable = pgTable(
  'character',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    author: text('author').notNull().default(''),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => llmModelTable.id),
    // required
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    learningContext: text('learning_context').notNull().default(''),
    competence: text('competence').notNull().default(''),
    filterGroup: json('filter_attributes')
      .$type<FilterGroup>()
      .notNull()
      .default(sql`'{}'::json`),
    // not required
    specifications: text('specifications'),
    restrictions: text('restrictions'),
    pictureId: text('picture_id'),
    initialMessage: text('initial_message'),
    accessLevel: accessLevelEnum('access_level').notNull().default('private'),
    hasLinkAccess: boolean('has_link_access').notNull().default(false),
    isWebSearchEnabled: boolean('is_web_search_enabled').notNull().default(false),
    webSearchScope: webSearchScopeEnum('web_search_scope').notNull().default('all-web'),
    webSearchIncludedDomains: text('web_search_included_domains')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
    attachedLinks: text('attached_links')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    suspended: boolean('suspended').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    originalCharacterId: uuid('original_character_id'),
  },
  (table) => [index().on(table.userId)],
);

export const characterSelectSchema = createSelectSchema(characterTable)
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema,
    ownerSchoolIds: z.array(z.string()),
    webSearchScope: webSearchScopeSchema,
    webSearchIncludedDomains: webSearchIncludedDomainsSchema,
  });
export const characterInsertSchema = createInsertSchema(characterTable)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    suspended: true,
  })
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });
export const characterUpdateSchema = createUpdateSchema(characterTable)
  .omit({
    userId: true,
    createdAt: true,
    updatedAt: true,
    suspended: true,
  })
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    id: z.string(),
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });

export type CharacterSelectModel = z.infer<typeof characterSelectSchema>;
export type CharacterInsertModel = z.infer<typeof characterInsertSchema>;
export type CharacterUpdateModel = z.infer<typeof characterUpdateSchema>;

/**
 * Schema for table character_template_mappings
 */
export const characterTemplateMappingTable = pgTable(
  'character_template_mappings',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characterTable.id, { onDelete: 'cascade' }),
    federalStateId: text('federal_state_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.federalStateId] }),
    foreignKey({
      columns: [table.federalStateId],
      foreignColumns: [federalStateTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'character_template_mappings_federal_state_id_fk',
    }).onDelete('cascade'),
  ],
);

export const characterTemplateMappingSelectSchema = createSelectSchema(
  characterTemplateMappingTable,
);
export const characterTemplateMappingInsertSchema = createInsertSchema(
  characterTemplateMappingTable,
);
// no update schema as there are only two fields which are both part of the primary key

export type CharacterTemplateMappingSelectModel = z.infer<
  typeof characterTemplateMappingSelectSchema
>;
export type CharacterTemplateMappingInsertModel = z.infer<
  typeof characterTemplateMappingInsertSchema
>;

/**
 * Schema for table llm_model
 */
export const llmModelTypeSchema = z.enum(['text', 'image', 'fc']);
export const llmModelTypeEnum = pgEnum('llm_model_type', llmModelTypeSchema.enum);
export type LlmModeType = z.infer<typeof llmModelTypeSchema>;
export const staticModelRoleSchema = z.enum([
  'default-chat',
  'fallback',
  'auxiliary',
  'strong-auxiliary',
  'auxiliary-fallback',
  'default-image',
]);
export type StaticModelRole = z.infer<typeof staticModelRoleSchema>;
export const staticModelsConfigurationSchema = z.object({
  'default-chat': z.string().uuid(),
  fallback: z.string().uuid(),
  auxiliary: z.string().uuid(),
  'strong-auxiliary': z.string().uuid(),
  'auxiliary-fallback': z.string().uuid(),
  'default-image': z.string().uuid(),
});
export type StaticModelsConfiguration = z.infer<typeof staticModelsConfigurationSchema>;

export const imageGenerationConfigSchema = z.object({
  aspectRatio: z.record(z.string(), z.string()),
});

export type ImageGenerationConfig = z.infer<typeof imageGenerationConfigSchema>;

export const llmModelTable = pgTable(
  'llm_model',
  {
    id: uuid('id').primaryKey(),
    provider: text('owner').notNull(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull().default(''),
    priceMetadata: json('price_metadata').$type<LlmModelPriceMetadata>().notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    supportedImageFormats: json('supported_image_formats').$type<string[]>(),
    imageGenerationConfig: jsonb('image_generation_config').$type<ImageGenerationConfig>(),
    isNew: boolean('is_new').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
  },
  (table) => [unique().on(table.provider, table.name)],
);

export const llmModelSelectSchema = createSelectSchema(llmModelTable).extend({
  createdAt: z.coerce.date(),
});
export const llmModelInsertSchema = createInsertSchema(llmModelTable).omit({
  id: true,
  createdAt: true,
});
export const llmModelUpdateSchema = createUpdateSchema(llmModelTable)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
  });

export type LlmModelSelectModel = z.infer<typeof llmModelSelectSchema>;
export type LlmModelInsertModel = z.infer<typeof llmModelInsertSchema>;
export type LlmModelUpdateModel = z.infer<typeof llmModelUpdateSchema>;

/** Generic project-wide JSON configuration object; services validate each key's value schema. */
export type ConfigurationValue = Record<string, unknown>;
export const configurationTable = pgTable('configuration', {
  key: text('key').primaryKey(),
  value: json('value').$type<ConfigurationValue>().notNull(),
});
export type Configuration = typeof configurationTable.$inferSelect;

/**
 * Schema for table federal_state_llm_model_mapping
 */
export const federalStateLlmModelMappingTable = pgTable(
  'federal_state_llm_model_mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    federalStateId: text('federal_state_id').notNull(),
    llmModelId: uuid('llm_model_id')
      .references(() => llmModelTable.id)
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.federalStateId],
      foreignColumns: [federalStateTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'federal_state_llm_model_mapping_federal_state_id_fk',
    }),
    unique('federal_state_llm_model_mapping_federal_state_llm_model_unique').on(
      table.federalStateId,
      table.llmModelId,
    ),
  ],
);

export const federalStateLlmModelMappingSelectSchema = createSelectSchema(
  federalStateLlmModelMappingTable,
).extend({
  createdAt: z.coerce.date(),
});
export const federalStateLlmModelMappingInsertSchema = createInsertSchema(
  federalStateLlmModelMappingTable,
).omit({ id: true, createdAt: true });
export const federalStateLlmModelMappingUpdateSchema = createUpdateSchema(
  federalStateLlmModelMappingTable,
)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
  });

export type FederalStateLlmModelMappingSelectModel = z.infer<
  typeof federalStateLlmModelMappingSelectSchema
>;
export type FederalStateLlmModelMappingInsertModel = z.infer<
  typeof federalStateLlmModelMappingInsertSchema
>;
export type FederalStateLlmModelMappingUpdateModel = z.infer<
  typeof federalStateLlmModelMappingUpdateSchema
>;

/**
 * Schema for table learning_scenario
 */
export const learningScenarioTable = pgTable(
  'learning_scenario',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    author: text('author').notNull().default(''),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    modelId: uuid('model_id')
      .notNull()
      .references(() => llmModelTable.id),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    filterGroup: json('filter_attributes')
      .$type<FilterGroup>()
      .notNull()
      .default(sql`'{}'::json`),
    studentExercise: text('student_exercise').default('').notNull(),
    additionalInstructions: text('additional_instructions'),
    restrictions: text('restrictions'), // Not used anymore
    attachedLinks: text('attached_links')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pictureId: text('picture_id'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
    suspended: boolean('suspended').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    accessLevel: accessLevelEnum('access_level').notNull().default('private'),
    originalLearningScenarioId: uuid('original_learning_scenario_id'),
    hasLinkAccess: boolean('has_link_access').notNull().default(false),
    isWebSearchEnabled: boolean('is_web_search_enabled').notNull().default(false),
    webSearchScope: webSearchScopeEnum('web_search_scope').notNull().default('all-web'),
    webSearchIncludedDomains: text('web_search_included_domains')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [index().on(table.userId)],
);

export const learningScenarioSelectSchema = createSelectSchema(learningScenarioTable)
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema,
    ownerSchoolIds: z.array(z.string()),
    webSearchScope: webSearchScopeSchema,
    webSearchIncludedDomains: webSearchIncludedDomainsSchema,
  });
export const learningScenarioInsertSchema = createInsertSchema(learningScenarioTable)
  .omit({
    createdAt: true,
    updatedAt: true,
    suspended: true,
  })
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });
export const learningScenarioUpdateSchema = createUpdateSchema(learningScenarioTable)
  .omit({ userId: true, createdAt: true, updatedAt: true, suspended: true })
  // for any reason accessLevel has a different type so we have to override it here
  .extend({
    id: z.string(),
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });

export type LearningScenarioSelectModel = z.infer<typeof learningScenarioSelectSchema>;
export type LearningScenarioInsertModel = z.infer<typeof learningScenarioInsertSchema>;
export type LearningScenarioUpdateModel = z.infer<typeof learningScenarioUpdateSchema>;

/**
 * Schema for table learning_scenario_template_mappings
 */
export const learningScenarioTemplateMappingTable = pgTable(
  'learning_scenario_template_mappings',
  {
    learningScenarioId: uuid('learning_scenario_id').notNull(),
    federalStateId: text('federal_state_id').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.learningScenarioId, table.federalStateId],
      name: 'learning_scenario_template_mappings_pk',
    }),
    foreignKey({
      columns: [table.learningScenarioId],
      foreignColumns: [learningScenarioTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'learning_scenario_template_mappings_learning_scenario_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.federalStateId],
      foreignColumns: [federalStateTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'learning_scenario_template_mappings_federal_state_id_fk',
    }).onDelete('cascade'),
  ],
);

export const learningScenarioTemplateMappingSelectSchema = createSelectSchema(
  learningScenarioTemplateMappingTable,
);
export const learningScenarioTemplateMappingInsertSchema = createInsertSchema(
  learningScenarioTemplateMappingTable,
);
// no update schema as there are only two fields which are both part of the primary key

/**
 * Schema for table shared_learning_scenario
 */
export const sharedLearningScenarioTable = pgTable(
  'shared_learning_scenario',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    learningScenarioId: uuid('learning_scenario_id').notNull(),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    tokenPointsLimit: integer('token_points_limit').notNull(),
    maxUsageTimeLimit: integer('max_usage_time_limit').notNull(),
    inviteCode: text('invite_code').unique().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    expiredAt: timestamp('expired_at', { withTimezone: true }).notNull(),
    manuallyStoppedAt: timestamp('manually_stopped_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.learningScenarioId],
      foreignColumns: [learningScenarioTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'shared_learning_scenario_learning_scenario_id_fk',
    }).onDelete('cascade'),
    index().on(table.learningScenarioId, table.userId),
  ],
);

export const sharedLearningScenarioSelectSchema = createSelectSchema(
  sharedLearningScenarioTable,
).extend({
  startedAt: z.coerce.date(),
  expiredAt: z.coerce.date(),
  manuallyStoppedAt: z.coerce.date().nullable(),
});
export const sharedLearningScenarioInsertSchema = createInsertSchema(
  sharedLearningScenarioTable,
).omit({
  id: true,
  inviteCode: true,
  startedAt: true,
  expiredAt: true,
  manuallyStoppedAt: true,
});
export const sharedLearningScenarioUpdateSchema = createUpdateSchema(sharedLearningScenarioTable)
  .omit({ learningScenarioId: true, userId: true, startedAt: true })
  .extend({
    id: z.string(),
  });

export type SharedLearningScenarioSelectModel = z.infer<typeof sharedLearningScenarioSelectSchema>;
export type SharedLearningScenarioInsertModel = z.infer<typeof sharedLearningScenarioInsertSchema>;
export type SharedLearningScenarioUpdateModel = z.infer<typeof sharedLearningScenarioUpdateSchema>;

// Type for learning scenario with sharing data (from JOIN with sharedLearningScenario)
const sharedLearningScenarioTransformedSchema = sharedLearningScenarioSelectSchema
  .omit({ id: true, learningScenarioId: true, userId: true })
  .extend({ startedBy: z.string() });
export const learningScenarioWithShareDataModel = learningScenarioSelectSchema.and(
  sharedLearningScenarioTransformedSchema,
);
export const learningScenarioOptionalShareDataModel = learningScenarioSelectSchema.and(
  sharedLearningScenarioTransformedSchema.extend({
    inviteCode: z.string().nullable(),
    maxUsageTimeLimit: z.number().nullable(),
    startedAt: z.coerce.date().nullable(),
    expiredAt: z.coerce.date().nullable(),
    startedBy: z.string().nullable(),
    tokenPointsLimit: z.number().nullable(),
    manuallyStoppedAt: z.coerce.date().nullable(),
  }),
);
export type LearningScenarioWithShareDataModel = z.infer<typeof learningScenarioWithShareDataModel>;
export type LearningScenarioOptionalShareDataModel = z.infer<
  typeof learningScenarioOptionalShareDataModel
>;

/**
 *  Type guard for learning scenario with share data
 *  This uses Zod validation for compile-time and runtime safety.
 */
export function isLearningScenarioWithShareData(
  scenario: unknown,
): scenario is LearningScenarioWithShareDataModel {
  const result = learningScenarioWithShareDataModel.safeParse(scenario);
  if (!result.success) {
    logError('isLearningScenarioWithShareData: validation failed', result.error);
  }
  return result.success;
}

export const toolCallNameSchema = z.enum(['web_search']);
export const toolCallNameEnum = pgEnum('tool_call_name', toolCallNameSchema.enum);
export type ToolCallName = z.infer<typeof toolCallNameSchema>;

export const toolCallCostTable = pgTable('tool_call_cost', {
  toolCallName: toolCallNameEnum('tool_call_name').primaryKey(),
  costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const toolCallCostSelectSchema = createSelectSchema(toolCallCostTable).extend({
  toolCallName: toolCallNameSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export const toolCallCostInsertSchema = createInsertSchema(toolCallCostTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const toolCallCostUpdateSchema = createUpdateSchema(toolCallCostTable)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    toolCallName: toolCallNameSchema,
  });

export type ToolCallCostSelectModel = z.infer<typeof toolCallCostSelectSchema>;
export type ToolCallCostInsertModel = z.infer<typeof toolCallCostInsertSchema>;
export type ToolCallCostUpdateModel = z.infer<typeof toolCallCostUpdateSchema>;

/**
 * Schema for table shared_learning_scenario_usage_tracking
 */
export const sharedLearningScenarioUsageTracking = pgTable(
  'shared_learning_scenario_usage_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Exactly one billing source is stored per row: either a model call or a tool call.
    modelId: uuid('model_id'),
    toolCallName: toolCallNameEnum('tool_call_name'),
    // learningScenarioId is not a FK, because usage tracking must be kept even when the learning scenario is deleted
    learningScenarioId: uuid('learning_scenario_id').notNull(),
    userId: uuid('user_id').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.modelId],
      foreignColumns: [llmModelTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'shared_learning_scenario_usage_tracking_model_id_fk',
    }),
    index('shared_learning_scenario_usage_tracking_conversation_id_index').on(
      table.learningScenarioId,
    ),
    index().on(table.userId),
    index().on(table.createdAt),
  ],
);

export const sharedLearningScenarioUsageTrackingSelectSchema = createSelectSchema(
  sharedLearningScenarioUsageTracking,
).extend({
  toolCallName: toolCallNameSchema.nullable(),
  createdAt: z.coerce.date(),
});
export const sharedLearningScenarioUsageTrackingInsertSchema = createInsertSchema(
  sharedLearningScenarioUsageTracking,
)
  .omit({ id: true, createdAt: true })
  .extend({
    toolCallName: toolCallNameSchema.nullable().optional(),
  });
export const sharedLearningScenarioUsageTrackingUpdateSchema = createUpdateSchema(
  sharedLearningScenarioUsageTracking,
)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
    toolCallName: toolCallNameSchema.nullable().optional(),
  });

export type SharedLearningScenarioUsageTrackingSelectModel = z.infer<
  typeof sharedLearningScenarioUsageTrackingSelectSchema
>;
export type SharedLearningScenarioUsageTrackingInsertModel = z.infer<
  typeof sharedLearningScenarioUsageTrackingInsertSchema
>;
export type SharedLearningScenarioUsageTrackingUpdateModel = z.infer<
  typeof sharedLearningScenarioUsageTrackingUpdateSchema
>;

/**
 * Schema for table conversation_usage_tracking
 */
export const conversationUsageTracking = pgTable(
  'conversation_usage_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Exactly one billing source is stored per row: either a model call or a tool call.
    modelId: uuid('model_id').references(() => llmModelTable.id),
    toolCallName: toolCallNameEnum('tool_call_name'),
    // this rows will be kept forever even if conversations are deleted, therefore we cannot enforce a foreign key constaint here
    conversationId: uuid('conversation_id').notNull(),
    // for easier tracking we add a user_id here to make less joins as this table will contain a lot of entries
    // this is not database normalization conform tho, we need to keep these rows forever too
    userId: uuid('user_id').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.conversationId),
    index().on(table.userId),
    index().on(table.createdAt),
  ],
);

export const conversationUsageTrackingSelectSchema = createSelectSchema(
  conversationUsageTracking,
).extend({
  toolCallName: toolCallNameSchema.nullable(),
  createdAt: z.coerce.date(),
});
export const conversationUsageTrackingInsertSchema = createInsertSchema(conversationUsageTracking)
  .omit({ id: true, createdAt: true })
  .extend({
    toolCallName: toolCallNameSchema.nullable().optional(),
  });
export const conversationUsageTrackingUpdateSchema = createUpdateSchema(conversationUsageTracking)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
    toolCallName: toolCallNameSchema.nullable().optional(),
  });

export type ConversationUsageTrackingSelectModel = z.infer<
  typeof conversationUsageTrackingSelectSchema
>;
export type ConversationUsageTrackingInsertModel = z.infer<
  typeof conversationUsageTrackingInsertSchema
>;
export type ConversationUsageTrackingUpdateModel = z.infer<
  typeof conversationUsageTrackingUpdateSchema
>;

/**
 * Schema for table shared_character_conversation
 */
export const sharedCharacterConversation = pgTable(
  'shared_character_conversation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    characterId: uuid('character_id').notNull(),
    userId: uuid('user_id')
      .references(() => userTable.id)
      .notNull(),
    tokenPointsLimit: integer('token_points_limit').notNull(),
    maxUsageTimeLimit: integer('max_usage_time_limit').notNull(),
    inviteCode: text('invite_code').unique().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    expiredAt: timestamp('expired_at', { withTimezone: true }).notNull(),
    manuallyStoppedAt: timestamp('manually_stopped_at', { withTimezone: true }),
  },
  (table) => [index().on(table.characterId, table.userId)],
);

export const sharedCharacterConversationSelectSchema = createSelectSchema(
  sharedCharacterConversation,
).extend({
  startedAt: z.coerce.date(),
  expiredAt: z.coerce.date(),
  manuallyStoppedAt: z.coerce.date().nullable(),
});
export const sharedCharacterConversationInsertSchema = createInsertSchema(
  sharedCharacterConversation,
).omit({ id: true, inviteCode: true, startedAt: true, expiredAt: true, manuallyStoppedAt: true });
export const sharedCharacterConversationUpdateSchema = createUpdateSchema(
  sharedCharacterConversation,
)
  .omit({ characterId: true, userId: true })
  .extend({
    id: z.string(),
  });

export type SharedCharacterConversationSelectModel = z.infer<
  typeof sharedCharacterConversationSelectSchema
>;
export type SharedCharacterConversationInsertModel = z.infer<
  typeof sharedCharacterConversationInsertSchema
>;
export type SharedCharacterConversationUpdateModel = z.infer<
  typeof sharedCharacterConversationUpdateSchema
>;

// Type for character with sharing data (from JOIN with sharedCharacterConversation)
const sharedCharacterTransformedSchema = sharedCharacterConversationSelectSchema
  .omit({ id: true, characterId: true, userId: true })
  .extend({ startedBy: z.string() });
export const characterWithShareDataModel = characterSelectSchema.and(
  sharedCharacterTransformedSchema,
);
export const characterOptionalShareDataModel = characterSelectSchema.and(
  sharedCharacterTransformedSchema.extend({
    inviteCode: z.string().nullable(),
    maxUsageTimeLimit: z.number().nullable(),
    startedAt: z.coerce.date().nullable(),
    expiredAt: z.coerce.date().nullable(),
    startedBy: z.string().nullable(),
    tokenPointsLimit: z.number().nullable(),
    manuallyStoppedAt: z.coerce.date().nullable(),
  }),
);
export type CharacterWithShareDataModel = z.infer<typeof characterWithShareDataModel>;
export type CharacterOptionalShareDataModel = z.infer<typeof characterOptionalShareDataModel>;

/**
 * Schema for table shared_character_chat_usage_tracking
 */
export const sharedCharacterChatUsageTrackingTable = pgTable(
  'shared_character_chat_usage_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Exactly one billing source is stored per row: either a model call or a tool call.
    modelId: uuid('model_id').references(() => llmModelTable.id),
    toolCallName: toolCallNameEnum('tool_call_name'),
    characterId: uuid('character_id').notNull(),
    userId: uuid('user_id').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    costsInCent: doublePrecision('costs_in_cent').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.characterId), index().on(table.userId), index().on(table.createdAt)],
);

export const sharedCharacterChatUsageTrackingSelectSchema = createSelectSchema(
  sharedCharacterChatUsageTrackingTable,
).extend({
  toolCallName: toolCallNameSchema.nullable(),
  createdAt: z.coerce.date(),
});
export const sharedCharacterChatUsageTrackingInsertSchema = createInsertSchema(
  sharedCharacterChatUsageTrackingTable,
)
  .omit({ id: true, createdAt: true })
  .extend({
    toolCallName: toolCallNameSchema.nullable().optional(),
  });
export const sharedCharacterChatUsageTrackingUpdateSchema = createUpdateSchema(
  sharedCharacterChatUsageTrackingTable,
)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
    toolCallName: toolCallNameSchema.nullable().optional(),
  });

export type SharedCharacterChatUsageTrackingSelectModel = z.infer<
  typeof sharedCharacterChatUsageTrackingSelectSchema
>;
export type SharedCharacterChatUsageTrackingInsertModel = z.infer<
  typeof sharedCharacterChatUsageTrackingInsertSchema
>;
export type SharedCharacterChatUsageTrackingUpdateModel = z.infer<
  typeof sharedCharacterChatUsageTrackingUpdateSchema
>;

/**
 * Schema for table assistant
 */
export const assistantTable = pgTable(
  'assistant',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    author: text('author').notNull().default(''),
    name: text('name').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    userId: uuid('user_id').references(() => userTable.id),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
    accessLevel: accessLevelEnum('access_level').notNull().default('private'),
    hasLinkAccess: boolean('has_link_access').notNull().default(false),
    isWebSearchEnabled: boolean('is_web_search_enabled').notNull().default(false),
    webSearchScope: webSearchScopeEnum('web_search_scope').notNull().default('all-web'),
    webSearchIncludedDomains: text('web_search_included_domains')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pictureId: text('picture_id'),
    description: text('description'),
    instructions: text('instructions'),
    filterGroup: json('filter_attributes')
      .$type<FilterGroup>()
      .notNull()
      .default(sql`'{}'::json`),
    promptSuggestions: text('prompt_suggestions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    attachedLinks: text('attached_links')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    suspended: boolean('suspended').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    originalAssistantId: uuid('original_assistant_id'),
  },
  (table) => [index().on(table.userId)],
);

export const assistantSelectSchema = createSelectSchema(assistantTable).extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  accessLevel: accessLevelSchema,
  filterGroup: filterGroupSchema,
  ownerSchoolIds: z.array(z.string()),
  webSearchScope: webSearchScopeSchema,
  webSearchIncludedDomains: webSearchIncludedDomainsSchema,
});
export const assistantInsertSchema = createInsertSchema(assistantTable)
  .omit({ id: true, createdAt: true, updatedAt: true, suspended: true })
  .extend({
    accessLevel: accessLevelSchema,
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });
export const assistantUpdateSchema = createUpdateSchema(assistantTable)
  .omit({
    userId: true,
    createdAt: true,
    updatedAt: true,
    suspended: true,
  })
  .extend({
    id: z.string(),
    // for any reason accessLevel has a different type so we have to override it here
    accessLevel: accessLevelSchema.optional(),
    filterGroup: filterGroupSchema.optional(),
    webSearchScope: webSearchScopeSchema.optional(),
    webSearchIncludedDomains: webSearchIncludedDomainsSchema.optional(),
  });

export type AssistantSelectModel = z.infer<typeof assistantSelectSchema>;
export type AssistantInsertModel = z.infer<typeof assistantInsertSchema>;
export type AssistantUpdateModel = z.infer<typeof assistantUpdateSchema>;

/**
 * Schema for table suspension_request
 */
export const suspensionRequestTable = pgTable(
  'suspension_request',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assistantId: uuid('assistant_id').references(() => assistantTable.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characterTable.id, { onDelete: 'cascade' }),
    learningScenarioId: uuid('learning_scenario_id').references(() => learningScenarioTable.id, {
      onDelete: 'cascade',
    }),
    requesterId: uuid('requester_id').references(() => userTable.id, {
      onDelete: 'set null',
    }),
    reason: suspensionRequestReasonEnum('reason').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    checked: boolean('checked').notNull().default(false),
  },
  (table) => [
    check(
      'suspension_request_exactly_one_target_ck',
      sql`((${table.assistantId} IS NOT NULL)::int + (${table.characterId} IS NOT NULL)::int + (${table.learningScenarioId} IS NOT NULL)::int) = 1`,
    ),
    index().on(table.assistantId),
    index().on(table.characterId),
    index().on(table.learningScenarioId),
    index().on(table.createdAt),
    index().on(table.checked),
  ],
);

export const suspensionRequestSelectSchema = createSelectSchema(suspensionRequestTable).extend({
  createdAt: z.coerce.date(),
  reason: suspensionRequestReasonSchema,
});

export const suspensionRequestInsertSchema = createInsertSchema(suspensionRequestTable).omit({
  id: true,
  createdAt: true,
  checked: true,
});

export const suspensionRequestUpdateSchema = createUpdateSchema(suspensionRequestTable)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
    reason: suspensionRequestReasonSchema.optional(),
  });

export type SuspensionRequestSelectModel = z.infer<typeof suspensionRequestSelectSchema>;
export type SuspensionRequestInsertModel = z.infer<typeof suspensionRequestInsertSchema>;
export type SuspensionRequestUpdateModel = z.infer<typeof suspensionRequestUpdateSchema>;

/**
 * Schema for table assistant_template_mappings
 */
export const assistantTemplateMappingTable = pgTable(
  'assistant_template_mappings',
  {
    assistantId: uuid('assistant_id')
      .notNull()
      .references(() => assistantTable.id, { onDelete: 'cascade' }),
    federalStateId: text('federal_state_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assistantId, table.federalStateId] }),
    foreignKey({
      columns: [table.federalStateId],
      foreignColumns: [federalStateTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'assistant_template_mappings_federal_state_id_fk',
    }).onDelete('cascade'),
  ],
);

export const assistantTemplateMappingSelectSchema = createSelectSchema(
  assistantTemplateMappingTable,
);
export const assistantTemplateMappingInsertSchema = createInsertSchema(
  assistantTemplateMappingTable,
);
// no update schema as there are only two fields which are both part of the primary key

export type AssistantTemplateMappingSelectModel = z.infer<
  typeof assistantTemplateMappingSelectSchema
>;
export type AssistantTemplateMappingInsertModel = z.infer<
  typeof assistantTemplateMappingInsertSchema
>;

/**
 * Schema for table file_table
 */
export const fileTable = pgTable(
  'file_table',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    metadata: json('metadata').$type<FileMetadata>(),
    userId: uuid('user_id').references(() => userTable.id),
  },
  (table) => [index().on(table.userId)],
);

export const fileSelectSchema = createSelectSchema(fileTable).extend({
  createdAt: z.coerce.date(),
});
export const fileInsertSchema = createInsertSchema(fileTable).omit({ createdAt: true });
export const fileUpdateSchema = createUpdateSchema(fileTable).omit({ createdAt: true }).extend({
  id: z.string(),
});

export type FileSelectModel = z.infer<typeof fileSelectSchema>;
export type FileInsertModel = z.infer<typeof fileInsertSchema>;
export type FileUpdateModel = z.infer<typeof fileUpdateSchema>;

// Keep existing extended types
export type FileModel = typeof fileTable.$inferSelect;
export type FileModelAndUrl = FileModel & { signedUrl: string };

/**
 * Schema for table conversation_message_file_mapping
 */
export const ConversationMessageFileMappingTable = pgTable(
  'conversation_message_file_mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: text('fileId')
      .references(() => fileTable.id)
      .notNull(),
    conversationMessageId: uuid('conversationMessageId').notNull(),
    // Redundant with conversationMessageId join, kept to make cleanup queries cheaper.
    conversationId: uuid('conversationId').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.conversationMessageId),
    index('conversation_message_file_mapping_conversation_id_index').on(table.conversationId),
    unique('conversation_message_file_mapping_message_id_file_id_unique').on(
      table.conversationMessageId,
      table.fileId,
    ),
    foreignKey({
      columns: [table.conversationMessageId],
      foreignColumns: [conversationMessageTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'conversation_message_file_mapping_conversationMessageId_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversationTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'conversation_message_file_mapping_conversationId_fk',
    }).onDelete('cascade'),
  ],
);

export const conversationMessageFileMappingSelectSchema = createSelectSchema(
  ConversationMessageFileMappingTable,
).extend({
  createdAt: z.coerce.date(),
});
export const conversationMessageFileMappingInsertSchema = createInsertSchema(
  ConversationMessageFileMappingTable,
).omit({ id: true, createdAt: true });
export const conversationMessageFileMappingUpdateSchema = createUpdateSchema(
  ConversationMessageFileMappingTable,
)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
  });

export type ConversationMessageFileMappingSelectModel = z.infer<
  typeof conversationMessageFileMappingSelectSchema
>;
export type ConversationMessageFileMappingInsertModel = z.infer<
  typeof conversationMessageFileMappingInsertSchema
>;
export type ConversationMessageFileMappingUpdateModel = z.infer<
  typeof conversationMessageFileMappingUpdateSchema
>;

/**
 * Schema for table learning_scenario_file_mapping
 */
export const LearningScenarioFileMapping = pgTable(
  'learning_scenario_file_mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: text('file_id')
      .references(() => fileTable.id)
      .notNull(),
    learningScenarioId: uuid('learning_scenario_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('learning_scenario_file_mapping_learningScenarioId_fileId_unique').on(
      table.learningScenarioId,
      table.fileId,
    ),
    foreignKey({
      columns: [table.learningScenarioId],
      foreignColumns: [learningScenarioTable.id],
      // Set a custom name because the auto-generated name is too long and will be silently truncated to 63 characters
      // The custom name can only be set with foreignKey() function
      name: 'learning_scenario_file_mapping_learning_scenario_id_fk',
    }).onDelete('cascade'),
  ],
);

export const learningScenarioFileMappingSelectSchema = createSelectSchema(
  LearningScenarioFileMapping,
).extend({
  createdAt: z.coerce.date(),
});
export const learningScenarioFileMappingInsertSchema = createInsertSchema(
  LearningScenarioFileMapping,
).omit({ id: true, createdAt: true });
export const learningScenarioFileMappingUpdateSchema = createUpdateSchema(
  LearningScenarioFileMapping,
)
  .omit({ createdAt: true })
  .extend({
    id: z.string(),
  });

export type LearningScenarioFileMappingSelectModel = z.infer<
  typeof learningScenarioFileMappingSelectSchema
>;
export type LearningScenarioFileMappingInsertModel = z.infer<
  typeof learningScenarioFileMappingInsertSchema
>;
export type LearningScenarioFileMappingUpdateModel = z.infer<
  typeof learningScenarioFileMappingUpdateSchema
>;

/**
 * Schema for table character_file_mapping
 */
export const CharacterFileMapping = pgTable(
  'character_file_mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: text('file_id')
      .references(() => fileTable.id)
      .notNull(),
    characterId: uuid('character_id')
      .references(() => characterTable.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.characterId, table.fileId)],
);

export const characterFileMappingSelectSchema = createSelectSchema(CharacterFileMapping).extend({
  createdAt: z.coerce.date(),
});
export const characterFileMappingInsertSchema = createInsertSchema(CharacterFileMapping).omit({
  id: true,
  createdAt: true,
});
export const characterFileMappingUpdateSchema = createUpdateSchema(CharacterFileMapping)
  .omit({
    createdAt: true,
  })
  .extend({
    id: z.string(),
  });

export type CharacterFileMappingSelectModel = z.infer<typeof characterFileMappingSelectSchema>;
export type CharacterFileMappingInsertModel = z.infer<typeof characterFileMappingInsertSchema>;
export type CharacterFileMappingUpdateModel = z.infer<typeof characterFileMappingUpdateSchema>;

/**
 * Schema for table assistant_file_mapping
 */
export const AssistantFileMapping = pgTable(
  'assistant_file_mapping',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: text('file_id')
      .references(() => fileTable.id)
      .notNull(),
    assistantId: uuid('assistant_id')
      .references(() => assistantTable.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.assistantId, table.fileId)],
);

export const assistantFileMappingSelectSchema = createSelectSchema(AssistantFileMapping).extend({
  createdAt: z.coerce.date(),
});
export const assistantFileMappingInsertSchema = createInsertSchema(AssistantFileMapping).omit({
  id: true,
  createdAt: true,
});
export const assistantFileMappingUpdateSchema = createUpdateSchema(AssistantFileMapping)
  .omit({
    createdAt: true,
  })
  .extend({
    id: z.string(),
  });

export type AssistantFileMappingSelectModel = z.infer<typeof assistantFileMappingSelectSchema>;
export type AssistantFileMappingInsertModel = z.infer<typeof assistantFileMappingInsertSchema>;
export type AssistantFileMappingUpdateModel = z.infer<typeof assistantFileMappingUpdateSchema>;

/**
 * Schema for table chunk
 */
export const chunkSourceTypeSchema = z.enum(['file', 'webpage']);
export const chunkSourceTypeEnum = pgEnum('chunk_source_type', chunkSourceTypeSchema.enum);
export type ChunkSourceType = z.infer<typeof chunkSourceTypeSchema>;

export const chunkTable = pgTable(
  'chunk',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: text('file_id').references(() => fileTable.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    content: text('content').notNull(),
    orderIndex: integer('order_index').notNull(),
    sourceType: chunkSourceTypeEnum('source_type').notNull().default('file'),
    sourceUrl: text('source_url'),
  },
  (table) => [index().on(table.fileId), unique().on(table.sourceUrl, table.orderIndex)],
);

export const chunkSelectSchema = createSelectSchema(chunkTable).extend({
  sourceType: chunkSourceTypeSchema,
});
export const chunkInsertSchema = createInsertSchema(chunkTable).omit({ id: true }).extend({
  sourceType: chunkSourceTypeSchema.optional(),
});
export const chunkUpdateSchema = createUpdateSchema(chunkTable).extend({
  id: z.string(),
  sourceType: chunkSourceTypeSchema.optional(),
});

export type ChunkSelectModel = z.infer<typeof chunkSelectSchema>;
export type ChunkInsertModel = z.infer<typeof chunkInsertSchema>;
export type ChunkUpdateModel = z.infer<typeof chunkUpdateSchema>;

/**
 * Schema for table voucher
 */
export const voucherStatus = z.enum(['created', 'redeemed', 'revoked']);
export const voucherStatusEnum = pgEnum('voucher_status', voucherStatus.enum);

export const VoucherTable = pgTable(
  'voucher',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    increaseAmount: integer('increase_amount').notNull(),
    durationMonths: integer('duration_months').notNull(),
    status: voucherStatusEnum('status').notNull().default('created'),
    validUntil: timestamp('valid_until', { mode: 'date', withTimezone: true }).notNull(),
    federalStateId: text('federal_state_id')
      .references(() => federalStateTable.id)
      .notNull(),
    redeemedBy: uuid('redeemed_by').references(() => userTable.id),
    redeemedAt: timestamp('redeemed_at', { mode: 'date', withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    createReason: text('create_reason').notNull().default(''),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }),
    updateReason: text('update_reason').notNull().default(''),
  },
  (table) => [index().on(table.federalStateId), index().on(table.redeemedBy)],
);

export const voucherSelectSchema = createSelectSchema(VoucherTable).extend({
  createdAt: z.coerce.date(),
  validUntil: z.coerce.date(),
  redeemedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date().nullable(),
});
export const voucherInsertSchema = createInsertSchema(VoucherTable)
  .extend({ status: voucherStatus })
  .omit({
    id: true,
    createdAt: true,
    redeemedAt: true,
    updatedAt: true,
  });
export const voucherUpdateSchema = createUpdateSchema(VoucherTable)
  .omit({
    createdAt: true,
  })
  .extend({
    id: z.string(),
    status: voucherStatus,
  });

export type VoucherSelectModel = z.infer<typeof voucherSelectSchema>;
export type VoucherInsertModel = z.infer<typeof voucherInsertSchema>;
export type VoucherUpdateModel = z.infer<typeof voucherUpdateSchema>;

/**** Url Presets ****/
export const urlPresetTable = pgTable('url_preset', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  orderNumber: integer('order_number').notNull().default(0),
  urls: text('urls').array().notNull(),
});
