CREATE TABLE "holiday_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"rule" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_catalog_country_slug_unique" ON "holiday_catalog" USING btree ("country","slug");--> statement-breakpoint
CREATE INDEX "holiday_catalog_country_idx" ON "holiday_catalog" USING btree ("country");--> statement-breakpoint
CREATE INDEX "holiday_catalog_isEnabled_idx" ON "holiday_catalog" USING btree ("is_enabled");