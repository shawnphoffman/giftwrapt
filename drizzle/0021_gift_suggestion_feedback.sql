CREATE TYPE "public"."gift_suggestion_verdict" AS ENUM('has-it', 'not-for-me');--> statement-breakpoint
CREATE TABLE "gift_suggestion_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recipient_user_id" text,
	"recipient_dependent_id" text,
	"title_key" text NOT NULL,
	"title" text NOT NULL,
	"verdict" "gift_suggestion_verdict" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_suggestion_feedback" ADD CONSTRAINT "gift_suggestion_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestion_feedback" ADD CONSTRAINT "gift_suggestion_feedback_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestion_feedback" ADD CONSTRAINT "gift_suggestion_feedback_recipient_dependent_id_dependents_id_fk" FOREIGN KEY ("recipient_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_suggestion_feedback_user_recipient_user_title_idx" ON "gift_suggestion_feedback" USING btree ("user_id","recipient_user_id","title_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_suggestion_feedback_user_recipient_dependent_title_idx" ON "gift_suggestion_feedback" USING btree ("user_id","recipient_dependent_id","title_key");--> statement-breakpoint
CREATE INDEX "gift_suggestion_feedback_recipient_user_verdict_idx" ON "gift_suggestion_feedback" USING btree ("recipient_user_id","verdict");--> statement-breakpoint
CREATE INDEX "gift_suggestion_feedback_recipient_dependent_verdict_idx" ON "gift_suggestion_feedback" USING btree ("recipient_dependent_id","verdict");