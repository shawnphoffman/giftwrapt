CREATE TYPE "public"."cron_run_status" AS ENUM('running', 'success', 'error', 'skipped');--> statement-breakpoint
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
CREATE INDEX "cron_runs_endpoint_started_idx" ON "cron_runs" USING btree ("endpoint","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cron_runs_status_started_idx" ON "cron_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cron_runs_started_idx" ON "cron_runs" USING btree ("started_at" DESC NULLS LAST);