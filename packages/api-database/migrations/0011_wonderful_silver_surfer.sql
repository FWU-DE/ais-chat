CREATE TABLE "llm_model_provider_key_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"llm_model_id" uuid NOT NULL,
	"provider_key_id" uuid NOT NULL,
	"upstream_model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_provider_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"settings" json NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "llm_provider_key" ("name", "provider", "settings", "organization_id")
SELECT
	(provider || '-' || left(md5(normalized_settings::text), 8)) AS "name",
	provider,
	normalized_settings::json,
	organization_id
FROM (
	SELECT DISTINCT ON (organization_id, COALESCE(settings->>'provider', provider), normalized_settings::text)
		COALESCE(settings->>'provider', provider) AS provider,
		normalized_settings,
		organization_id
	FROM "llm_model",
	LATERAL (
		SELECT CASE
			WHEN COALESCE(settings->>'provider', provider) = 'azure' THEN jsonb_set(
				settings::jsonb,
				'{baseUrl}',
				to_jsonb(regexp_replace(settings->>'baseUrl', '^(https?://[^/]+).*$', '\1'))
			)
			ELSE settings::jsonb
		END AS normalized_settings
	) normalized
) existing_keys;--> statement-breakpoint
INSERT INTO "llm_model_provider_key_mapping" ("llm_model_id", "provider_key_id", "upstream_model_name")
SELECT
	model.id,
	provider_key.id,
	CASE
		WHEN provider_key.provider = 'azure' THEN COALESCE(
			substring(model.settings->>'baseUrl' from '/deployments/([^/?]+)'),
			model.name
		)
		ELSE model.name
	END
FROM "llm_model" model
JOIN "llm_provider_key" provider_key
	ON provider_key.organization_id = model.organization_id
	AND provider_key.provider = COALESCE(model.settings->>'provider', model.provider)
	AND provider_key.settings::jsonb = CASE
		WHEN COALESCE(model.settings->>'provider', model.provider) = 'azure' THEN jsonb_set(
			model.settings::jsonb,
			'{baseUrl}',
			to_jsonb(regexp_replace(model.settings->>'baseUrl', '^(https?://[^/]+).*$', '\1'))
		)
		ELSE model.settings::jsonb
	END;--> statement-breakpoint
UPDATE "llm_model" SET "provider" = 'bifrost', "settings" = '{"provider":"bifrost"}'::json;--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "provider" SET DEFAULT 'bifrost';--> statement-breakpoint
ALTER TABLE "llm_model_provider_key_mapping" ADD CONSTRAINT "llm_model_provider_key_mapping_llm_model_id_llm_model_id_fk" FOREIGN KEY ("llm_model_id") REFERENCES "public"."llm_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_model_provider_key_mapping" ADD CONSTRAINT "llm_model_provider_key_mapping_provider_key_id_llm_provider_key_id_fk" FOREIGN KEY ("provider_key_id") REFERENCES "public"."llm_provider_key"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_provider_key" ADD CONSTRAINT "llm_provider_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_model_provider_key_mapping_llm_model_id_index" ON "llm_model_provider_key_mapping" USING btree ("llm_model_id");--> statement-breakpoint
CREATE INDEX "llm_model_provider_key_mapping_provider_key_id_index" ON "llm_model_provider_key_mapping" USING btree ("provider_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_model_provider_key_mapping_model_key_unique" ON "llm_model_provider_key_mapping" USING btree ("llm_model_id","provider_key_id");--> statement-breakpoint
CREATE INDEX "llm_provider_key_organization_id_index" ON "llm_provider_key" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_provider_key_organization_id_name_unique" ON "llm_provider_key" USING btree ("organization_id","name");
