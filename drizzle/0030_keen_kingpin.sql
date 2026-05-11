CREATE TYPE "public"."custom_holiday_source" AS ENUM('catalog', 'custom');--> statement-breakpoint
CREATE TABLE "custom_holiday_reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_holiday_id" uuid NOT NULL,
	"occurrence_year" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source" "custom_holiday_source" NOT NULL,
	"catalog_country" text,
	"catalog_key" text,
	"custom_month" smallint,
	"custom_day" smallint,
	"custom_year" integer,
	"icon_key" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone,
	"sort_order" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "custom_holiday_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_holiday_reminder_logs" ADD CONSTRAINT "custom_holiday_reminder_logs_custom_holiday_id_custom_holidays_id_fk" FOREIGN KEY ("custom_holiday_id") REFERENCES "public"."custom_holidays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_holiday_reminder_logs_holiday_year_idx" ON "custom_holiday_reminder_logs" USING btree ("custom_holiday_id","occurrence_year");--> statement-breakpoint
CREATE INDEX "custom_holidays_source_idx" ON "custom_holidays" USING btree ("source");--> statement-breakpoint
CREATE INDEX "todo_items_listId_idx" ON "todo_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "todo_items_listId_claimedByUserId_idx" ON "todo_items" USING btree ("list_id","claimed_by_user_id");--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_custom_holiday_id_custom_holidays_id_fk" FOREIGN KEY ("custom_holiday_id") REFERENCES "public"."custom_holidays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_customHolidayId_idx" ON "lists" USING btree ("custom_holiday_id");