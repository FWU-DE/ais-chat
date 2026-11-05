ALTER TABLE "assistant" ADD COLUMN "popularity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "popularity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "popularity" integer DEFAULT 0 NOT NULL;