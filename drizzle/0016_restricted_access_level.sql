CREATE TYPE "public"."access_level" AS ENUM('none', 'restricted', 'view');--> statement-breakpoint
ALTER TABLE "user_relationships" ADD COLUMN "access_level" "access_level" DEFAULT 'view' NOT NULL;--> statement-breakpoint
UPDATE "user_relationships" SET "access_level" = CASE WHEN "can_view" THEN 'view'::"public"."access_level" ELSE 'none'::"public"."access_level" END;--> statement-breakpoint
ALTER TABLE "user_relationships" DROP COLUMN "can_view";
