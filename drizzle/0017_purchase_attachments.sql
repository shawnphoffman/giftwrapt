CREATE TABLE "purchase_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"gift_id" integer,
	"addon_id" integer,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "purchase_attachments_one_owner" CHECK (("purchase_attachments"."gift_id" IS NULL) <> ("purchase_attachments"."addon_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_gift_id_gifted_items_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifted_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_addon_id_list_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."list_addons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_attachments_giftId_idx" ON "purchase_attachments" USING btree ("gift_id");--> statement-breakpoint
CREATE INDEX "purchase_attachments_addonId_idx" ON "purchase_attachments" USING btree ("addon_id");