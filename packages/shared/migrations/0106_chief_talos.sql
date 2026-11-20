CREATE TABLE "user_favorite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assistant_id" uuid,
	"character_id" uuid,
	"learning_scenario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_exactly_one_target_ck" CHECK ((("user_favorite"."assistant_id" IS NOT NULL)::int + ("user_favorite"."character_id" IS NOT NULL)::int + ("user_favorite"."learning_scenario_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
ALTER TABLE "user_favorite" ADD CONSTRAINT "user_favorite_user_id_user_entity_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite" ADD CONSTRAINT "user_favorite_assistant_id_assistant_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite" ADD CONSTRAINT "user_favorite_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite" ADD CONSTRAINT "user_favorite_learning_scenario_id_learning_scenario_id_fk" FOREIGN KEY ("learning_scenario_id") REFERENCES "public"."learning_scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorite_user_assistant_uq" ON "user_favorite" USING btree ("user_id","assistant_id") WHERE "user_favorite"."assistant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorite_user_character_uq" ON "user_favorite" USING btree ("user_id","character_id") WHERE "user_favorite"."character_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorite_user_learning_scenario_uq" ON "user_favorite" USING btree ("user_id","learning_scenario_id") WHERE "user_favorite"."learning_scenario_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_favorite_assistant_id_index" ON "user_favorite" USING btree ("assistant_id");--> statement-breakpoint
CREATE INDEX "user_favorite_character_id_index" ON "user_favorite" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "user_favorite_learning_scenario_id_index" ON "user_favorite" USING btree ("learning_scenario_id");