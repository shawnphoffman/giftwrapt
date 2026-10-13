CREATE TABLE "gift_suggestion_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recipient_user_id" text,
	"recipient_dependent_id" text,
	"list_id" integer,
	"occasion" text,
	"budget" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"details" text NOT NULL,
	"reason" text NOT NULL,
	"price_band" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_suggestion_sets" ADD CONSTRAINT "gift_suggestion_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestion_sets" ADD CONSTRAINT "gift_suggestion_sets_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestion_sets" ADD CONSTRAINT "gift_suggestion_sets_recipient_dependent_id_dependents_id_fk" FOREIGN KEY ("recipient_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestion_sets" ADD CONSTRAINT "gift_suggestion_sets_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_suggestions" ADD CONSTRAINT "gift_suggestions_set_id_gift_suggestion_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."gift_suggestion_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_suggestion_sets_user_recipient_user_idx" ON "gift_suggestion_sets" USING btree ("user_id","recipient_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gift_suggestion_sets_user_recipient_dependent_idx" ON "gift_suggestion_sets" USING btree ("user_id","recipient_dependent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gift_suggestion_sets_created_at_idx" ON "gift_suggestion_sets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gift_suggestions_set_idx" ON "gift_suggestions" USING btree ("set_id");