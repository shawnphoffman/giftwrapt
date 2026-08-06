CREATE TABLE "intelligence_verdicts" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"verdict" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intelligence_verdicts_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "item_ai_analysis" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"analysis_version" integer NOT NULL,
	"model" text,
	"category" text,
	"is_clothing" boolean DEFAULT false NOT NULL,
	"has_size" boolean DEFAULT false NOT NULL,
	"has_color" boolean DEFAULT false NOT NULL,
	"sizing_rationale" text,
	"suggested_sizes" jsonb,
	"suggested_colors" jsonb,
	"canonical_name" text,
	"attributes" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_run_steps" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "recommendation_runs" ADD COLUMN "analyzer_input_hashes" jsonb;--> statement-breakpoint
ALTER TABLE "intelligence_verdicts" ADD CONSTRAINT "intelligence_verdicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_ai_analysis" ADD CONSTRAINT "item_ai_analysis_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_verdicts_created_idx" ON "intelligence_verdicts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "item_ai_analysis_canonical_idx" ON "item_ai_analysis" USING btree ("canonical_name");