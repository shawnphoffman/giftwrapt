CREATE TABLE "recommendation_sub_item_dismissals" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"sub_item_id" text NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_sub_item_dismissals_user_id_fingerprint_sub_item_id_pk" PRIMARY KEY("user_id","fingerprint","sub_item_id")
);
--> statement-breakpoint
ALTER TABLE "recommendation_sub_item_dismissals" ADD CONSTRAINT "recommendation_sub_item_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_sub_item_dismissals_user_fingerprint_idx" ON "recommendation_sub_item_dismissals" USING btree ("user_id","fingerprint");