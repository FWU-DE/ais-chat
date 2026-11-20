ALTER TABLE "assistant" ADD COLUMN "is_speech_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant" ADD COLUMN "voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant" ADD COLUMN "speech_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "is_speech_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "speech_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "is_speech_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "speech_only" boolean DEFAULT false NOT NULL;