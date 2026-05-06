CREATE TYPE "public"."relation_label" AS ENUM('mother', 'father');--> statement-breakpoint
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
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relation_labels" ADD CONSTRAINT "user_relation_labels_target_dependent_id_dependents_id_fk" FOREIGN KEY ("target_dependent_id") REFERENCES "public"."dependents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_relation_labels_userId_idx" ON "user_relation_labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_relation_labels_targetUserId_idx" ON "user_relation_labels" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_relation_labels_targetDependentId_idx" ON "user_relation_labels" USING btree ("target_dependent_id");