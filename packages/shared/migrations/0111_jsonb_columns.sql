ALTER TABLE "assistant" ALTER COLUMN "filter_attributes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "filter_attributes" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "filter_attributes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "filter_attributes" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "configuration" ALTER COLUMN "value" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "federal_state" ALTER COLUMN "support_contacts" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "federal_state" ALTER COLUMN "design_configuration" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "federal_state" ALTER COLUMN "picture_urls" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "federal_state" ALTER COLUMN "feature_toggles" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "file_table" ALTER COLUMN "metadata" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "learning_scenario" ALTER COLUMN "filter_attributes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "learning_scenario" ALTER COLUMN "filter_attributes" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "supported_image_formats" SET DATA TYPE jsonb;