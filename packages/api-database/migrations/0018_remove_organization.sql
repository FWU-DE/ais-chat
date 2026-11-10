ALTER TABLE "llm_model" DROP CONSTRAINT "llm_model_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "llm_provider_key" DROP CONSTRAINT "llm_provider_key_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "llm_model_organization_id_index";--> statement-breakpoint
DROP INDEX "llm_provider_key_organization_id_index";--> statement-breakpoint
DROP INDEX "llm_provider_key_organization_id_name_unique";--> statement-breakpoint
DROP INDEX "project_organization_id_index";--> statement-breakpoint
ALTER TABLE "llm_model" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "llm_provider_key" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "organization_id";--> statement-breakpoint
DROP TABLE "organization";--> statement-breakpoint
CREATE UNIQUE INDEX "llm_provider_key_name_unique" ON "llm_provider_key" USING btree ("name");
