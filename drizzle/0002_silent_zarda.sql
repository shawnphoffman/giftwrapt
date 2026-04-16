CREATE TYPE "public"."group_type" AS ENUM('or', 'order');--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "type" "group_type" DEFAULT 'or' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "group_sort_order" smallint;