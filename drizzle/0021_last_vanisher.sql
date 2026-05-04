CREATE TYPE "public"."item_scrape_job_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "item_scrape_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" text,
	"url" text NOT NULL,
	"status" "item_scrape_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "item_scrape_jobs" ADD CONSTRAINT "item_scrape_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrape_jobs" ADD CONSTRAINT "item_scrape_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_status_nextAttemptAt_idx" ON "item_scrape_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_itemId_idx" ON "item_scrape_jobs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_userId_idx" ON "item_scrape_jobs" USING btree ("user_id");