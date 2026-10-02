ALTER TABLE "assistant" ADD COLUMN "is_school_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant" ADD COLUMN "is_community_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "is_school_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "is_community_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "is_school_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "is_community_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_scenario" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Community sharing implies school and link sharing.
UPDATE "assistant" SET "is_school_shared" = true WHERE "access_level" = 'school';--> statement-breakpoint
UPDATE "assistant" SET "is_community_shared" = true, "is_school_shared" = true, "has_link_access" = true WHERE "access_level" = 'community';--> statement-breakpoint
UPDATE "assistant" SET "is_global" = true WHERE "access_level" = 'global';--> statement-breakpoint
UPDATE "character" SET "is_school_shared" = true WHERE "access_level" = 'school';--> statement-breakpoint
UPDATE "character" SET "is_community_shared" = true, "is_school_shared" = true, "has_link_access" = true WHERE "access_level" = 'community';--> statement-breakpoint
UPDATE "character" SET "is_global" = true WHERE "access_level" = 'global';--> statement-breakpoint
UPDATE "learning_scenario" SET "is_school_shared" = true WHERE "access_level" = 'school';--> statement-breakpoint
UPDATE "learning_scenario" SET "is_community_shared" = true, "is_school_shared" = true, "has_link_access" = true WHERE "access_level" = 'community';--> statement-breakpoint
UPDATE "learning_scenario" SET "is_global" = true WHERE "access_level" = 'global';--> statement-breakpoint
ALTER TABLE "assistant" DROP COLUMN "access_level";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "access_level";--> statement-breakpoint
ALTER TABLE "learning_scenario" DROP COLUMN "access_level";--> statement-breakpoint
DROP TYPE "public"."access_level";