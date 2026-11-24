CREATE TABLE "gift_exchange_blocks" (
	"exchange_id" uuid NOT NULL,
	"giver_member_id" uuid NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	CONSTRAINT "gift_exchange_blocks_exchange_id_giver_member_id_recipient_member_id_pk" PRIMARY KEY("exchange_id","giver_member_id","recipient_member_id")
);
--> statement-breakpoint
CREATE TABLE "gift_exchange_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"user_id" text,
	"gives_to_member_id" uuid,
	"seen_at" timestamp with time zone,
	"changed_at" timestamp with time zone,
	"ready_email_sent_at" timestamp with time zone,
	CONSTRAINT "gift_exchange_members_exchange_id_user_id_unique" UNIQUE("exchange_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gift_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"budget" numeric(10, 2),
	"budget_currency" text,
	"gift_date" date NOT NULL,
	"drawn_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_exchange_blocks" ADD CONSTRAINT "gift_exchange_blocks_exchange_id_gift_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."gift_exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchange_blocks" ADD CONSTRAINT "gift_exchange_blocks_giver_member_id_gift_exchange_members_id_fk" FOREIGN KEY ("giver_member_id") REFERENCES "public"."gift_exchange_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchange_blocks" ADD CONSTRAINT "gift_exchange_blocks_recipient_member_id_gift_exchange_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."gift_exchange_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchange_members" ADD CONSTRAINT "gift_exchange_members_exchange_id_gift_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."gift_exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchange_members" ADD CONSTRAINT "gift_exchange_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchange_members" ADD CONSTRAINT "gift_exchange_members_gives_to_member_id_gift_exchange_members_id_fk" FOREIGN KEY ("gives_to_member_id") REFERENCES "public"."gift_exchange_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_exchanges" ADD CONSTRAINT "gift_exchanges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_exchange_members_user_id_idx" ON "gift_exchange_members" USING btree ("user_id");