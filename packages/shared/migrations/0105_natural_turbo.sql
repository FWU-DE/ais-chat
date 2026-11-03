CREATE TABLE "shared_chat_session_message" (
	"id" text NOT NULL,
	"session_id" text NOT NULL,
	"content" text NOT NULL,
	"role" "conversation_role" NOT NULL,
	"order_number" integer NOT NULL,
	"tool_calls" json,
	"tool_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_chat_session_message_session_id_id_pk" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "shared_chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_code" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_chat_session_entity_type_check" CHECK ("shared_chat_session"."entity_type" in ('character', 'learningScenario'))
);
--> statement-breakpoint
ALTER TABLE "shared_chat_session_message" ADD CONSTRAINT "shared_chat_session_message_session_id_shared_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."shared_chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_chat_session_message_session_id_order_number_unique" ON "shared_chat_session_message" USING btree ("session_id","order_number");--> statement-breakpoint
CREATE INDEX "shared_chat_session_expires_at_index" ON "shared_chat_session" USING btree ("expires_at");