ALTER TABLE "item_scrapes" ADD COLUMN "rating_value" real;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD COLUMN "rating_count" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rating_value" real;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rating_count" integer;