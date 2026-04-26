ALTER TABLE "item_scrapes" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD COLUMN "ok" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD COLUMN "ms" integer;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD COLUMN "error_code" text;--> statement-breakpoint
CREATE INDEX "item_scrapes_url_createdAt_idx" ON "item_scrapes" USING btree ("url","created_at" DESC NULLS LAST);