ALTER TABLE "assistant" ADD COLUMN "license_information" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "license_information" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "license_information" text DEFAULT '' NOT NULL;