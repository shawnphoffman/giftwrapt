CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint
);
--> statement-breakpoint
CREATE INDEX "rateLimit_key_idx" ON "rateLimit" USING btree ("key");