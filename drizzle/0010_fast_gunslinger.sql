ALTER TABLE "item_scrapes" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD CONSTRAINT "item_scrapes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_scrapes_createdAt_idx" ON "item_scrapes" USING btree ("created_at" DESC NULLS LAST);