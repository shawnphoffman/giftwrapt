ALTER TABLE "items" ADD COLUMN "pending_deletion_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "items_pendingDeletionAt_idx" ON "items" USING btree ("pending_deletion_at");--> statement-breakpoint
ALTER TABLE "gifted_items" ADD COLUMN "orphan_reminder_sent_at" timestamp with time zone;
