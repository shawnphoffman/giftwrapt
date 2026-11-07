ALTER TABLE "oauth_application" ADD COLUMN "first_approved_at" timestamp;--> statement-breakpoint
UPDATE "oauth_application" a SET "first_approved_at" = a."created_at" WHERE EXISTS (SELECT 1 FROM "oauth_consent" c WHERE c."client_id" = a."client_id") OR EXISTS (SELECT 1 FROM "oauth_access_token" t WHERE t."client_id" = a."client_id");
