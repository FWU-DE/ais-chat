ALTER TABLE "llm_model" RENAME COLUMN "price_metada" TO "price_metadata";
--> statement-breakpoint
ALTER TABLE "llm_model" ALTER COLUMN "price_metadata" SET DATA TYPE jsonb;
--> statement-breakpoint
UPDATE "llm_model"
SET "price_metadata" = "price_metadata"
    || jsonb_build_object('inputImageTokenPrice', COALESCE("price_metadata"->'inputImageTokenPrice', '0'::jsonb))
    || jsonb_build_object('outputTextTokenPrice', COALESCE("price_metadata"->'outputTextTokenPrice', '0'::jsonb))
WHERE "price_metadata"->>'type' = 'image'
  AND "price_metadata" ? 'inputTextTokenPrice';
