-- Existing rows may hold non-uuid ids that cannot be cast; shared chat data is intentionally discarded.
DELETE FROM "shared_chat_conversation" WHERE 1 = 1;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" DROP CONSTRAINT "shared_chat_message_file_message_fk";--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" DROP CONSTRAINT "shared_chat_message_file_conversation_fk";--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" DROP CONSTRAINT "shared_chat_conversation_fk";--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" DROP CONSTRAINT "shared_chat_conversation_message_conversation_id_id_pk";--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ALTER COLUMN "conversation_message_id" SET DATA TYPE uuid USING "conversation_message_id"::uuid;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ALTER COLUMN "conversation_id" SET DATA TYPE uuid USING "conversation_id"::uuid;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ALTER COLUMN "conversation_id" SET DATA TYPE uuid USING "conversation_id"::uuid;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ADD CONSTRAINT "shared_chat_message_file_message_fk" FOREIGN KEY ("conversation_message_id") REFERENCES "public"."shared_chat_conversation_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message_file_mapping" ADD CONSTRAINT "shared_chat_message_file_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."shared_chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_chat_conversation_message" ADD CONSTRAINT "shared_chat_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."shared_chat_conversation"("id") ON DELETE cascade ON UPDATE no action;
