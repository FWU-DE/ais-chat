ALTER TABLE "assistant" ADD COLUMN "didactic_commentary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "didactic_commentary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "didactic_commentary" text DEFAULT '' NOT NULL;