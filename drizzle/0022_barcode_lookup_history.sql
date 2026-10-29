CREATE TABLE "barcode_lookup_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"raw_code" text NOT NULL,
	"gtin14" text,
	"outcome" text NOT NULL,
	"source" text,
	"provider_id" text,
	"results" jsonb,
	"error_message" text,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barcode_lookup_history" ADD CONSTRAINT "barcode_lookup_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "barcode_lookup_history_created_at_idx" ON "barcode_lookup_history" USING btree ("created_at");