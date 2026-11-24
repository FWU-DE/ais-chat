ALTER TABLE "llm_model" ADD COLUMN "vendor" text;--> statement-breakpoint
ALTER TABLE "llm_model" ADD COLUMN "reasoning" jsonb;
--> statement-breakpoint
UPDATE "llm_model" SET "vendor" = CASE
  WHEN "name" ILIKE 'gpt-%' OR "name" ILIKE 'openai/%' THEN 'openai'
  WHEN "name" ILIKE '%claude%' THEN 'anthropic'
  WHEN "name" ILIKE 'gemini%' OR "name" ILIKE 'google/%' OR "name" ILIKE 'imagen%' THEN 'google'
  WHEN "name" ILIKE '%llama%' THEN 'meta'
  WHEN "name" ILIKE '%mistral%' THEN 'mistral'
  WHEN "name" ILIKE 'qwen%' THEN 'alibabacloud'
  WHEN "name" ILIKE 'baai/%' THEN 'baai'
  WHEN "name" ILIKE 'black-forest-labs/%' THEN 'bfl'
  WHEN "name" ILIKE 'azure speech%' THEN 'microsoft'
END;--> statement-breakpoint
UPDATE "llm_model" SET
  "reasoning" = jsonb_strip_nulls("additional_parameters"::jsonb -> 'reasoning'),
  "additional_parameters" = ("additional_parameters"::jsonb - 'reasoning')::json
WHERE jsonb_typeof("additional_parameters"::jsonb -> 'reasoning') = 'object';
