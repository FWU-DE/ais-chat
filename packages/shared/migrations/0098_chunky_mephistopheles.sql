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
-- Legacy community items need an approved request so owners can withdraw them.
INSERT INTO "community_template_request" ("assistant_id", "created_by", "status")
SELECT "id", "user_id", 'approved' FROM "assistant" WHERE "access_level" = 'community' AND "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "community_template_request" ("character_id", "created_by", "status")
SELECT "id", "user_id", 'approved' FROM "character" WHERE "access_level" = 'community' AND "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "community_template_request" ("learning_scenario_id", "created_by", "status")
SELECT "id", "user_id", 'approved' FROM "learning_scenario" WHERE "access_level" = 'community' AND "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "community_template_request_events" ("template_request_id", "created_by_id", "created_by_name", "created_by_role", "event_type", "message")
SELECT r."id", '00000000-0000-0000-0000-000000000000', 'System', 'editor', 'approve', 'Datenmigration'
FROM "community_template_request" r
WHERE r."status" = 'approved'
  AND NOT EXISTS (SELECT 1 FROM "community_template_request_events" e WHERE e."template_request_id" = r."id");--> statement-breakpoint
ALTER TABLE "assistant" DROP COLUMN "access_level";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "access_level";--> statement-breakpoint
ALTER TABLE "learning_scenario" DROP COLUMN "access_level";--> statement-breakpoint
DROP TYPE "public"."access_level";