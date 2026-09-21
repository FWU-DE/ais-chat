CREATE TYPE "public"."template_request_creator_role" AS ENUM('user', 'editor');--> statement-breakpoint
CREATE TYPE "public"."template_request_event_type" AS ENUM('submit', 'approve', 'reject', 'cancel', 'user_message', 'editor_message');--> statement-breakpoint
CREATE TABLE "community_template_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"created_by_name" text,
	"created_by_role" "template_request_creator_role" NOT NULL,
	"event_type" "template_request_event_type" NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_template_request_message" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "community_template_request_message" CASCADE;--> statement-breakpoint
DROP TYPE "public"."template_request_status";--> statement-breakpoint
CREATE TYPE "public"."template_request_status" AS ENUM('submitted', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TABLE "community_template_request" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "community_template_request" ALTER COLUMN "status" SET DEFAULT 'submitted';--> statement-breakpoint
ALTER TABLE "community_template_request_events" ADD CONSTRAINT "community_template_request_events_template_request_id_community_template_request_id_fk" FOREIGN KEY ("template_request_id") REFERENCES "public"."community_template_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_template_request_events_template_request_id_index" ON "community_template_request_events" USING btree ("template_request_id");--> statement-breakpoint
ALTER TABLE "community_template_request" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "community_template_request" DROP COLUMN "updated_by";--> statement-breakpoint
ALTER TABLE "community_template_request" DROP COLUMN "editor_updated_at";--> statement-breakpoint
ALTER TABLE "community_template_request" DROP COLUMN "editor_updated_by";