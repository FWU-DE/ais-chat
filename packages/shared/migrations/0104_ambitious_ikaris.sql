ALTER TABLE "shared_character_conversation" RENAME TO "shared_character";
--> statement-breakpoint
ALTER TABLE "shared_character" RENAME CONSTRAINT "shared_character_conversation_invite_code_unique" TO "shared_character_invite_code_unique";
--> statement-breakpoint
ALTER TABLE "shared_character" RENAME CONSTRAINT "shared_character_conversation_user_id_user_entity_id_fk" TO "shared_character_user_id_user_entity_id_fk";
--> statement-breakpoint
ALTER INDEX "shared_character_conversation_character_id_user_id_index" RENAME TO "shared_character_character_id_user_id_index";