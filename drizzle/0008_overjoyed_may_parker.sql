CREATE TABLE "gift_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"gift_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_contributions_giftId_userId_uq" UNIQUE("gift_id","user_id"),
	CONSTRAINT "gift_contributions_amount_nonneg" CHECK ("gift_contributions"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gift_contributions" ADD CONSTRAINT "gift_contributions_gift_id_gifted_items_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifted_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_contributions" ADD CONSTRAINT "gift_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_contributions_giftId_idx" ON "gift_contributions" USING btree ("gift_id");