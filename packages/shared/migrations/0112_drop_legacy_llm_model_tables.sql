DROP TABLE "federal_state_llm_model_mapping" CASCADE;--> statement-breakpoint
DROP TABLE "llm_model" CASCADE;--> statement-breakpoint
ALTER TABLE "federal_state" DROP COLUMN "encrypted_api_key";--> statement-breakpoint
DROP TYPE "public"."llm_model_type";