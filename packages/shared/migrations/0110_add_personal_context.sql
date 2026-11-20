CREATE TABLE "personal_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_context_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "assistant" ADD COLUMN "is_personal_context_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "personal_context_enabled" boolean;--> statement-breakpoint
ALTER TABLE "personal_context" ADD CONSTRAINT "personal_context_user_id_user_entity_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_entity"("id") ON DELETE cascade ON UPDATE no action;