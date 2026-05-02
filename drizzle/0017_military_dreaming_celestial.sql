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
ALTER TABLE "lists" ADD COLUMN "subject_dependent_id" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "gift_ideas_target_dependent_id" text;--> statement-breakpoint
ALTER TABLE "dependent_guardianships" ADD CONSTRAINT "dependent_guardianships_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependent_guardianships" ADD CONSTRAINT "dependent_guardianships_dependent_id_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dependent_guardianships_dependentId_idx" ON "dependent_guardianships" USING btree ("dependent_id");--> statement-breakpoint
CREATE INDEX "dependents_createdByUserId_idx" ON "dependents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "dependents_isArchived_idx" ON "dependents" USING btree ("is_archived");--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_subject_dependent_id_dependents_id_fk" FOREIGN KEY ("subject_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_gift_ideas_target_dependent_id_dependents_id_fk" FOREIGN KEY ("gift_ideas_target_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_subjectDependentId_idx" ON "lists" USING btree ("subject_dependent_id");--> statement-breakpoint
CREATE INDEX "lists_giftIdeasTargetDependentId_idx" ON "lists" USING btree ("gift_ideas_target_dependent_id");