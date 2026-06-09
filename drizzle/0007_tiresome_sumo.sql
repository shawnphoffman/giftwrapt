ALTER TABLE "lists" ADD COLUMN "archive_defer_until" timestamp;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "last_archived_at" timestamp;--> statement-breakpoint
-- Backfill last_archived_at from the existing holiday idempotency mark so
-- holiday lists that already auto-archived show a real "last archived" date
-- instead of "Never" right after launch. Other list types start null.
UPDATE "lists" SET "last_archived_at" = "last_holiday_archive_at" WHERE "last_holiday_archive_at" IS NOT NULL;