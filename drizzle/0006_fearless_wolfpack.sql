ALTER TABLE "items" ADD COLUMN "vendor_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "vendor_source" text;--> statement-breakpoint
CREATE INDEX "items_listId_vendorId_idx" ON "items" USING btree ("list_id","vendor_id");