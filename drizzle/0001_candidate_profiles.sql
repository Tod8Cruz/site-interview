CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "candidate_profile_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_single_default" ON "candidate_profiles" USING btree ("is_default") WHERE "candidate_profiles"."is_default";--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE set null ON UPDATE no action;