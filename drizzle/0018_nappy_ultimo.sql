CREATE TYPE "public"."recommendation_run_status" AS ENUM('running', 'success', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recommendation_run_trigger" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recommendation_severity" AS ENUM('info', 'suggest', 'important');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('active', 'dismissed', 'applied');--> statement-breakpoint
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
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
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
ALTER TABLE "recommendation_run_steps" ADD CONSTRAINT "recommendation_run_steps_run_id_recommendation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recommendation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_run_steps_run_idx" ON "recommendation_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "recommendation_run_steps_created_idx" ON "recommendation_run_steps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recommendation_runs_user_started_idx" ON "recommendation_runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommendation_runs_status_started_idx" ON "recommendation_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommendations_user_status_created_idx" ON "recommendations" USING btree ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recommendations_user_batch_idx" ON "recommendations" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX "recommendations_user_fingerprint_idx" ON "recommendations" USING btree ("user_id","fingerprint");