ALTER TABLE "custom_holidays" ADD COLUMN "recipient_user_id" text;--> statement-breakpoint
ALTER TABLE "custom_holidays" ADD COLUMN "recipient_dependent_id" text;--> statement-breakpoint
ALTER TABLE "custom_holidays" ADD CONSTRAINT "custom_holidays_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_holidays" ADD CONSTRAINT "custom_holidays_recipient_dependent_id_dependents_id_fk" FOREIGN KEY ("recipient_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_holidays_recipient_user_id_idx" ON "custom_holidays" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "custom_holidays_recipient_dependent_id_idx" ON "custom_holidays" USING btree ("recipient_dependent_id");