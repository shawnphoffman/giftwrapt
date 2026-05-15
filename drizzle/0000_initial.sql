CREATE TYPE "public"."cron_run_status" AS ENUM('running', 'success', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."custom_holiday_source" AS ENUM('catalog', 'custom');--> statement-breakpoint
CREATE TYPE "public"."access_level" AS ENUM('none', 'restricted', 'view');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."birth_month" AS ENUM('january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('or', 'order');--> statement-breakpoint
CREATE TYPE "public"."list_type" AS ENUM('wishlist', 'christmas', 'birthday', 'giftideas', 'holiday', 'todos', 'test');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'very-high');--> statement-breakpoint
CREATE TYPE "public"."relation_label" AS ENUM('mother', 'father');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'child');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('incomplete', 'complete');--> statement-breakpoint
CREATE TYPE "public"."recommendation_run_status" AS ENUM('running', 'success', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recommendation_run_trigger" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recommendation_severity" AS ENUM('info', 'suggest', 'important');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('active', 'dismissed', 'applied');--> statement-breakpoint
CREATE TYPE "public"."item_scrape_job_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
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
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"permissions" text,
	"metadata" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now(),
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint
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
CREATE TABLE "twoFactor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
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
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"status" "cron_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"skip_reason" text,
	"error" text,
	"summary" jsonb
);
--> statement-breakpoint
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
CREATE TABLE "dependent_guardianships" (
	"guardian_user_id" text NOT NULL,
	"dependent_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dependent_guardianships_guardian_user_id_dependent_id_pk" PRIMARY KEY("guardian_user_id","dependent_id")
);
--> statement-breakpoint
CREATE TABLE "dependents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"birth_month" "birth_month",
	"birth_day" smallint,
	"birth_year" smallint,
	"created_by_user_id" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
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
	"orphan_reminder_sent_at" timestamp with time zone,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gifted_items_quantity_positive" CHECK ("gifted_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "holiday_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"rule" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"analyzer" text NOT NULL,
	"prompt" text,
	"response_raw" text,
	"parsed" jsonb,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "recommendation_run_status" DEFAULT 'running' NOT NULL,
	"trigger" "recommendation_run_trigger" NOT NULL,
	"skip_reason" text,
	"error" text,
	"input_hash" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"estimated_cost_micro_usd" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_sub_item_dismissals" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"sub_item_id" text NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_sub_item_dismissals_user_id_fingerprint_sub_item_id_pk" PRIMARY KEY("user_id","fingerprint","sub_item_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"dependent_id" text,
	"batch_id" uuid NOT NULL,
	"analyzer_id" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "recommendation_status" DEFAULT 'active' NOT NULL,
	"severity" "recommendation_severity" DEFAULT 'suggest' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp
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
	"type" "group_type" DEFAULT 'or' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"name" text,
	"sort_order" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_scrape_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" text,
	"url" text NOT NULL,
	"status" "item_scrape_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_scrapes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer,
	"user_id" text,
	"url" text NOT NULL,
	"scraper_id" text NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"score" integer,
	"ms" integer,
	"error_code" text,
	"response" json,
	"title" text,
	"clean_title" text,
	"description" text,
	"price" text,
	"currency" text,
	"image_urls" text[],
	"rating_value" real,
	"rating_count" integer,
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
	"availability_changed_at" timestamp with time zone,
	"url" text,
	"vendor_id" text,
	"vendor_source" text,
	"image_url" text,
	"price" text,
	"currency" text,
	"notes" text,
	"rating_value" real,
	"rating_count" integer,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"pending_deletion_at" timestamp with time zone,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"group_sort_order" smallint,
	"sort_order" integer,
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
	"subject_dependent_id" text,
	"gift_ideas_target_user_id" text,
	"gift_ideas_target_dependent_id" text,
	"holiday_country" text,
	"holiday_key" text,
	"last_holiday_archive_at" timestamp,
	"custom_holiday_id" uuid,
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
	"access_level" "access_level" DEFAULT 'view' NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_relationships_owner_user_id_viewer_user_id_pk" PRIMARY KEY("owner_user_id","viewer_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_relation_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" "relation_label" NOT NULL,
	"target_user_id" text,
	"target_dependent_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
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
	"birth_year" smallint,
	"image" text,
	"partner_id" text,
	"partner_anniversary" date,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_holiday_reminder_logs" ADD CONSTRAINT "custom_holiday_reminder_logs_custom_holiday_id_custom_holidays_id_fk" FOREIGN KEY ("custom_holiday_id") REFERENCES "public"."custom_holidays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependent_guardianships" ADD CONSTRAINT "dependent_guardianships_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependent_guardianships" ADD CONSTRAINT "dependent_guardianships_dependent_id_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifted_items" ADD CONSTRAINT "gifted_items_gifter_id_users_id_fk" FOREIGN KEY ("gifter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_run_steps" ADD CONSTRAINT "recommendation_run_steps_run_id_recommendation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recommendation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_sub_item_dismissals" ADD CONSTRAINT "recommendation_sub_item_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_dependent_id_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrape_jobs" ADD CONSTRAINT "item_scrape_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrape_jobs" ADD CONSTRAINT "item_scrape_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD CONSTRAINT "item_scrapes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scrapes" ADD CONSTRAINT "item_scrapes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_item_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_addons" ADD CONSTRAINT "list_addons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_subject_dependent_id_dependents_id_fk" FOREIGN KEY ("subject_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_gift_ideas_target_user_id_users_id_fk" FOREIGN KEY ("gift_ideas_target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_gift_ideas_target_dependent_id_dependents_id_fk" FOREIGN KEY ("gift_ideas_target_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_custom_holiday_id_custom_holidays_id_fk" FOREIGN KEY ("custom_holiday_id") REFERENCES "public"."custom_holidays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_child_user_id_users_id_fk" FOREIGN KEY ("child_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_editors" ADD CONSTRAINT "list_editors_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationships" ADD CONSTRAINT "user_relationships_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_target_dependent_id_dependents_id_fk" FOREIGN KEY ("target_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikey_userId_idx" ON "apikey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "rateLimit_key_idx" ON "rateLimit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expiresAt_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_impersonatedBy_idx" ON "session" USING btree ("impersonated_by");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expiresAt_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cron_runs_endpoint_started_idx" ON "cron_runs" USING btree ("endpoint","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cron_runs_status_started_idx" ON "cron_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cron_runs_started_idx" ON "cron_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "custom_holiday_reminder_logs_holiday_year_idx" ON "custom_holiday_reminder_logs" USING btree ("custom_holiday_id","occurrence_year");--> statement-breakpoint
CREATE INDEX "custom_holidays_source_idx" ON "custom_holidays" USING btree ("source");--> statement-breakpoint
CREATE INDEX "dependent_guardianships_dependentId_idx" ON "dependent_guardianships" USING btree ("dependent_id");--> statement-breakpoint
CREATE INDEX "dependents_createdByUserId_idx" ON "dependents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "dependents_isArchived_idx" ON "dependents" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "gifted_items_itemId_idx" ON "gifted_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "gifted_items_gifterId_idx" ON "gifted_items" USING btree ("gifter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_catalog_country_slug_unique" ON "holiday_catalog" USING btree ("country","slug");--> statement-breakpoint
CREATE INDEX "holiday_catalog_country_idx" ON "holiday_catalog" USING btree ("country");--> statement-breakpoint
CREATE INDEX "holiday_catalog_isEnabled_idx" ON "holiday_catalog" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "recommendation_run_steps_run_idx" ON "recommendation_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "recommendation_run_steps_created_idx" ON "recommendation_run_steps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recommendation_runs_user_started_idx" ON "recommendation_runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommendation_runs_status_started_idx" ON "recommendation_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rec_sub_item_dismissals_user_fingerprint_idx" ON "recommendation_sub_item_dismissals" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "recommendations_user_status_created_idx" ON "recommendations" USING btree ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommendations_user_batch_idx" ON "recommendations" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX "recommendations_user_fingerprint_idx" ON "recommendations" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "recommendations_user_dependent_status_idx" ON "recommendations" USING btree ("user_id","dependent_id","status");--> statement-breakpoint
CREATE INDEX "item_comments_itemId_idx" ON "item_comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_groups_listId_idx" ON "item_groups" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_status_nextAttemptAt_idx" ON "item_scrape_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_itemId_idx" ON "item_scrape_jobs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_scrape_jobs_userId_idx" ON "item_scrape_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "item_scrapes_itemId_idx" ON "item_scrapes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_scrapes_itemId_createdAt_idx" ON "item_scrapes" USING btree ("item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_scrapes_url_createdAt_idx" ON "item_scrapes" USING btree ("url","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "item_scrapes_createdAt_idx" ON "item_scrapes" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_listId_idx" ON "items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "items_listId_isArchived_idx" ON "items" USING btree ("list_id","is_archived");--> statement-breakpoint
CREATE INDEX "items_listId_vendorId_idx" ON "items" USING btree ("list_id","vendor_id");--> statement-breakpoint
CREATE INDEX "items_groupId_idx" ON "items" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "items_pendingDeletionAt_idx" ON "items" USING btree ("pending_deletion_at");--> statement-breakpoint
CREATE INDEX "list_addons_listId_idx" ON "list_addons" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_addons_userId_idx" ON "list_addons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lists_ownerId_idx" ON "lists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lists_ownerId_isActive_idx" ON "lists" USING btree ("owner_id","is_active");--> statement-breakpoint
CREATE INDEX "lists_isPrivate_isActive_idx" ON "lists" USING btree ("is_private","is_active");--> statement-breakpoint
CREATE INDEX "lists_giftIdeasTargetUserId_idx" ON "lists" USING btree ("gift_ideas_target_user_id");--> statement-breakpoint
CREATE INDEX "lists_subjectDependentId_idx" ON "lists" USING btree ("subject_dependent_id");--> statement-breakpoint
CREATE INDEX "lists_giftIdeasTargetDependentId_idx" ON "lists" USING btree ("gift_ideas_target_dependent_id");--> statement-breakpoint
CREATE INDEX "lists_customHolidayId_idx" ON "lists" USING btree ("custom_holiday_id");--> statement-breakpoint
CREATE INDEX "list_editors_userId_idx" ON "list_editors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "list_editors_ownerId_idx" ON "list_editors" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "user_relation_labels_userId_idx" ON "user_relation_labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_relation_labels_targetUserId_idx" ON "user_relation_labels" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_relation_labels_targetDependentId_idx" ON "user_relation_labels" USING btree ("target_dependent_id");--> statement-breakpoint
CREATE INDEX "todo_items_listId_idx" ON "todo_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "todo_items_listId_claimedByUserId_idx" ON "todo_items" USING btree ("list_id","claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "users_partnerId_idx" ON "users" USING btree ("partner_id");