ALTER TABLE "llm_model" ALTER COLUMN "settings" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "supported_image_formats" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "supported_image_formats" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "additional_parameters" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "additional_parameters" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "llm_provider_key" ALTER COLUMN "settings" SET DATA TYPE jsonb;