CREATE TABLE "shared_chat_conversation_message_file_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" text NOT NULL,
	"conversation_message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_chat_message_file_unique" UNIQUE("conversation_message_id","conversation_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "shared_chat_conversation_message" (
	"id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"content" text NOT NULL,
	"role" "conversation_role" NOT NULL,
	"order_number" integer NOT NULL,
	"tool_calls" json,
	"tool_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_chat_conversation_message_conversation_id_id_pk" PRIMARY KEY("conversation_id","id")
);
--> statement-breakpoint
CREATE TABLE "shared_chat_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"share_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_chat_conversation_entity_type_check" CHECK ("shared_chat_conversation"."entity_type" in ('character', 'learningScenario'))
);
--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ADD CONSTRAINT "shared_chat_message_file_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_table"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ADD CONSTRAINT "shared_chat_message_file_message_fk" FOREIGN KEY ("conversation_id","conversation_message_id") REFERENCES "public"."shared_chat_conversation_message"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ADD CONSTRAINT "shared_chat_message_file_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."shared_chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ADD CONSTRAINT "shared_chat_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."shared_chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_chat_message_file_message_idx" ON "shared_chat_conversation_message_file_mapping" USING btree ("conversation_message_id");--> statement-breakpoint
CREATE INDEX "shared_chat_message_file_conversation_idx" ON "shared_chat_conversation_message_file_mapping" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_chat_message_order_unique" ON "shared_chat_conversation_message" USING btree ("conversation_id","order_number");