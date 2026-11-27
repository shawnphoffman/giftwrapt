CREATE TABLE "item_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_categories_listId_idx" ON "item_categories" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_listId_name_unique" ON "item_categories" USING btree ("list_id",lower("name"));--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_groups_categoryId_idx" ON "item_groups" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "items_categoryId_idx" ON "items" USING btree ("category_id");