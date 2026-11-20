CREATE TABLE "configuration" (
	"key" text PRIMARY KEY NOT NULL,
	"value" json NOT NULL
);
--> statement-breakpoint
INSERT INTO "configuration" ("key", "value")
SELECT
  'static_models',
  json_build_object(
    'default-chat', default_chat_model,
    'fallback', fallback_model,
    'auxiliary', auxiliary_model,
    'strong-auxiliary', strong_auxiliary_model,
    'auxiliary-fallback', auxiliary_fallback_model,
    'default-image', default_image_model
  )
FROM (
  SELECT
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'gpt-5-mini' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'text' AND "name" NOT ILIKE '%mistral%' ORDER BY "created_at" LIMIT 1)
    ) AS default_chat_model,
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'gpt-5-nano' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'text' AND "name" NOT ILIKE '%mistral%' ORDER BY "created_at" LIMIT 1)
    ) AS fallback_model,
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'gpt-4o-mini' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'text' AND "name" NOT ILIKE '%mistral%' ORDER BY "created_at" LIMIT 1)
    ) AS auxiliary_model,
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'gpt-5.5' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'text' AND "name" NOT ILIKE '%mistral%' ORDER BY "created_at" LIMIT 1)
    ) AS strong_auxiliary_model,
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'meta-llama/Llama-3.3-70B-Instruct' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'text' AND "name" NOT ILIKE '%mistral%' ORDER BY "created_at" LIMIT 1)
    ) AS auxiliary_fallback_model,
    COALESCE(
      (SELECT "id" FROM "llm_model" WHERE "name" = 'imagen-4.0-generate-001' ORDER BY "created_at" LIMIT 1),
      (SELECT "id" FROM "llm_model" WHERE "price_metadata"->>'type' = 'image' ORDER BY "created_at" LIMIT 1)
    ) AS default_image_model
) AS defaults
WHERE default_chat_model IS NOT NULL AND default_image_model IS NOT NULL;
