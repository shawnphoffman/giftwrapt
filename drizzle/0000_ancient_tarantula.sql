CREATE TYPE "public"."availability" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."birth_month" AS ENUM('january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december');--> statement-breakpoint
CREATE TYPE "public"."list_type" AS ENUM('wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'very-high');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'child');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('incomplete', 'complete');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gifted_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"gifter_id" text NOT NULL,
	"additional_gifter_ids" text[],
	"quantity" smallint DEFAULT 1 NOT NULL,
	"total_cost" numeric,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gifted_items_quantity_positive" CHECK ("gifted_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"comment" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_scrapes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"url" text NOT NULL,
	"scraper_id" text NOT NULL,
	"response" json,
	"title" text,
	"clean_title" text,
	"description" text,
	"price" text,
	"currency" text,
	"image_urls" text[],
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"group_id" integer,
	"title" text NOT NULL,
	"status" "status" DEFAULT 'incomplete' NOT NULL,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"url" text,
	"image_url" text,
	"price" text,
	"currency" text,
	"notes" text,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "list_addons" (
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
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "list_type" DEFAULT 'wishlist' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"gift_ideas_target_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardianships" (
	"parent_user_id" text NOT NULL,
	"child_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guardianships_parent_user_id_child_user_id_pk" PRIMARY KEY("parent_user_id","child_user_id")
);
--> statement-breakpoint
CREATE TABLE "list_editors" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "list_editors_listId_userId_unique" UNIQUE("list_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_relationships" (
	"owner_user_id" text NOT NULL,
	"viewer_user_id" text NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_relationships_owner_user_id_viewer_user_id_pk" PRIMARY KEY("owner_user_id","viewer_user_id")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"birth_month" "birth_month",
	"birth_day" smallint,
	"image" text,
	"partner_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_gifter_id_users_id_fk" FOREIGN KEY ("gifter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD CONSTRAINT "item_scrapes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_item_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_gift_ideas_target_user_id_users_id_fk" FOREIGN KEY ("gift_ideas_target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_child_user_id_users_id_fk" FOREIGN KEY ("child_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expiresAt_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_impersonatedBy_idx" ON "session" USING btree ("impersonated_by");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expiresAt_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "gifted_items_itemId_idx" ON "gifted_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "gifted_items_gifterId_idx" ON "gifted_items" USING btree ("gifter_id");--> statement-breakpoint
CREATE INDEX "item_comments_itemId_idx" ON "item_comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_groups_listId_idx" ON "item_groups" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "item_scrapes_itemId_idx" ON "item_scrapes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_scrapes_itemId_createdAt_idx" ON "item_scrapes" USING btree ("item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_listId_idx" ON "items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "items_listId_isArchived_idx" ON "items" USING btree ("list_id","is_archived");--> statement-breakpoint
CREATE INDEX "items_groupId_idx" ON "items" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "list_addons_listId_idx" ON "list_addons" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_addons_userId_idx" ON "list_addons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lists_ownerId_idx" ON "lists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lists_ownerId_isActive_idx" ON "lists" USING btree ("owner_id","is_active");--> statement-breakpoint
CREATE INDEX "lists_isPrivate_isActive_idx" ON "lists" USING btree ("is_private","is_active");--> statement-breakpoint
CREATE INDEX "lists_giftIdeasTargetUserId_idx" ON "lists" USING btree ("gift_ideas_target_user_id");--> statement-breakpoint
CREATE INDEX "list_editors_userId_idx" ON "list_editors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "list_editors_ownerId_idx" ON "list_editors" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "users_partnerId_idx" ON "users" USING btree ("partner_id");