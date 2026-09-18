CREATE TABLE "community_template_request_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_template_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assistant_id" uuid,
	"character_id" uuid,
	"learning_scenario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	"editor_updated_at" timestamp with time zone,
	"editor_updated_by" text,
	"status" "template_request_status" DEFAULT 'created' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "community_template_request_exactly_one_target_ck" CHECK ((("community_template_request"."assistant_id" IS NOT NULL)::int + ("community_template_request"."character_id" IS NOT NULL)::int + ("community_template_request"."learning_scenario_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
ALTER TABLE "community_template_request_message" ADD CONSTRAINT "community_template_request_message_template_request_id_community_template_request_id_fk" FOREIGN KEY ("template_request_id") REFERENCES "public"."community_template_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_template_request" ADD CONSTRAINT "community_template_request_assistant_id_assistant_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_template_request" ADD CONSTRAINT "community_template_request_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_template_request" ADD CONSTRAINT "community_template_request_learning_scenario_id_learning_scenario_id_fk" FOREIGN KEY ("learning_scenario_id") REFERENCES "public"."learning_scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_template_request_message_template_request_id_index" ON "community_template_request_message" USING btree ("template_request_id");--> statement-breakpoint
CREATE INDEX "community_template_request_assistant_id_index" ON "community_template_request" USING btree ("assistant_id");--> statement-breakpoint
CREATE INDEX "community_template_request_character_id_index" ON "community_template_request" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "community_template_request_learning_scenario_id_index" ON "community_template_request" USING btree ("learning_scenario_id");--> statement-breakpoint
CREATE INDEX "community_template_request_status_index" ON "community_template_request" USING btree ("status");