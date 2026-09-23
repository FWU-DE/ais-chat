DROP INDEX "community_template_request_assistant_id_index";--> statement-breakpoint
DROP INDEX "community_template_request_character_id_index";--> statement-breakpoint
DROP INDEX "community_template_request_learning_scenario_id_index";--> statement-breakpoint
CREATE UNIQUE INDEX "community_template_request_assistant_id_unique" ON "community_template_request" USING btree ("assistant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_template_request_character_id_unique" ON "community_template_request" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_template_request_learning_scenario_id_unique" ON "community_template_request" USING btree ("learning_scenario_id");