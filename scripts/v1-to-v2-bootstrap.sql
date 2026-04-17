-- One-shot V1 → V2 reconciliation for the existing production database.
--
-- Brings the V1 schema (pre-Phase 1 rewrite) up to match the V2 schema that
-- drizzle migrations 0000, 0001, 0002 collectively produce, then seeds
-- drizzle.__drizzle_migrations with those three hashes so the next
-- `drizzle-kit migrate` run (wired into vercel-build) sees them as applied
-- and starts cleanly from 0003+.
--
-- Idempotent — safe to run more than once. Wraps in a transaction so any
-- failure rolls the whole thing back.
--
-- Apply via Supabase apply_migration or:
--   psql "$DATABASE_URL" -f scripts/v1-to-v2-bootstrap.sql
--
-- NOTE: no explicit BEGIN/COMMIT — apply_migration and psql -f handle
-- transactions for us. Adding our own would nest and break.

-- ============================================================
-- 1. Missing enums
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "public"."availability" AS ENUM('available', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."group_type" AS ENUM('or', 'order');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Missing tables
-- ============================================================

-- gifted_items (note: 0000 originally added is_archived; 0001 dropped it,
-- so the V2 post-0002 shape has no is_archived column)
CREATE TABLE IF NOT EXISTS "gifted_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"gifter_id" text NOT NULL,
	"additional_gifter_ids" text[],
	"quantity" smallint DEFAULT 1 NOT NULL,
	"total_cost" numeric,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gifted_items_quantity_positive" CHECK ("quantity" > 0)
);

DO $$ BEGIN
	ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_item_id_items_id_fk"
		FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_gifter_id_users_id_fk"
		FOREIGN KEY ("gifter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "gifted_items_itemId_idx" ON "gifted_items" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "gifted_items_gifterId_idx" ON "gifted_items" USING btree ("gifter_id");

-- list_addons
CREATE TABLE IF NOT EXISTS "list_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"total_cost" numeric,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_list_id_lists_id_fk"
		FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "list_addons_listId_idx" ON "list_addons" USING btree ("list_id");
CREATE INDEX IF NOT EXISTS "list_addons_userId_idx" ON "list_addons" USING btree ("user_id");

-- list_editors
CREATE TABLE IF NOT EXISTS "list_editors" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "list_editors_listId_userId_unique" UNIQUE("list_id","user_id")
);

DO $$ BEGIN
	ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_list_id_lists_id_fk"
		FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_owner_id_users_id_fk"
		FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "list_editors_userId_idx" ON "list_editors" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "list_editors_ownerId_idx" ON "list_editors" USING btree ("owner_id");

-- ============================================================
-- 3. Missing columns on existing tables
-- ============================================================

-- lists
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "gift_ideas_target_user_id" text;

DO $$ BEGIN
	ALTER TABLE "lists" ADD CONSTRAINT "lists_gift_ideas_target_user_id_users_id_fk"
		FOREIGN KEY ("gift_ideas_target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "lists_giftIdeasTargetUserId_idx" ON "lists" USING btree ("gift_ideas_target_user_id");

-- items
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "availability" "availability" DEFAULT 'available' NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "group_sort_order" smallint;

-- item_groups
ALTER TABLE "item_groups" ADD COLUMN IF NOT EXISTS "type" "group_type" DEFAULT 'or' NOT NULL;

-- ============================================================
-- 4. Drop V1-only columns that V2 doesn't have
-- ============================================================
DROP INDEX IF EXISTS "item_comments_is_archived_idx";
ALTER TABLE "item_comments" DROP COLUMN IF EXISTS "is_archived";

-- ============================================================
-- 5. Missing indexes on existing tables
-- ============================================================
CREATE INDEX IF NOT EXISTS "item_scrapes_itemId_createdAt_idx"
	ON "item_scrapes" USING btree ("item_id", "created_at" DESC NULLS LAST);

-- ============================================================
-- 6. Seed drizzle migrations tracker so drizzle-kit migrate no-ops
--
-- Hashes = sha256 of each drizzle/<tag>.sql file.
-- created_at = `when` from drizzle/meta/_journal.json.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
	id SERIAL PRIMARY KEY,
	hash text NOT NULL,
	created_at bigint
);

INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT 'b24c9469678d7c5e3d0db372d98f35d5312ad4c8e469099537ec292d8db5f8fd', 1776274841534
WHERE NOT EXISTS (
	SELECT 1 FROM "drizzle"."__drizzle_migrations"
	WHERE hash = 'b24c9469678d7c5e3d0db372d98f35d5312ad4c8e469099537ec292d8db5f8fd'
);

INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT '52c0c083da3e11e9e277b9b08448d22a8cab7db9c420613566a1a5c50afb1751', 1776296171909
WHERE NOT EXISTS (
	SELECT 1 FROM "drizzle"."__drizzle_migrations"
	WHERE hash = '52c0c083da3e11e9e277b9b08448d22a8cab7db9c420613566a1a5c50afb1751'
);

INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT '28d756691f8ce602333231e475c7a2f898174ec6b58df82768b92434b5c6b53a', 1776365553040
WHERE NOT EXISTS (
	SELECT 1 FROM "drizzle"."__drizzle_migrations"
	WHERE hash = '28d756691f8ce602333231e475c7a2f898174ec6b58df82768b92434b5c6b53a'
);
