CREATE TABLE "product_lookups" (
	"code" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"results" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
