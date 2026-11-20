ALTER TABLE "character" DROP CONSTRAINT "character_model_id_llm_model_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation_usage_tracking" DROP CONSTRAINT "conversation_usage_tracking_model_id_llm_model_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_scenario" DROP CONSTRAINT "learning_scenario_model_id_llm_model_id_fk";
--> statement-breakpoint
ALTER TABLE "shared_character_chat_usage_tracking" DROP CONSTRAINT "shared_character_chat_usage_tracking_model_id_llm_model_id_fk";
--> statement-breakpoint
ALTER TABLE "shared_learning_scenario_usage_tracking" DROP CONSTRAINT "shared_learning_scenario_usage_tracking_model_id_fk";
