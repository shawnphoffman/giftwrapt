ALTER TYPE "public"."list_type" ADD VALUE 'holiday' BEFORE 'todos';--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "holiday_country" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "holiday_key" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "last_holiday_archive_at" timestamp;