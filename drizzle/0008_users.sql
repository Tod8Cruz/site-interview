CREATE TABLE "user_settings" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP INDEX "candidate_profiles_single_default";--> statement-breakpoint
DROP INDEX "evaluation_rubrics_single_default";--> statement-breakpoint
DROP INDEX "prompts_single_default";--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD CONSTRAINT "evaluation_rubrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_user_idx" ON "interviews" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "questions_user_idx" ON "questions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_single_default" ON "candidate_profiles" USING btree ("user_id") WHERE "candidate_profiles"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_rubrics_single_default" ON "evaluation_rubrics" USING btree ("user_id") WHERE "evaluation_rubrics"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_single_default" ON "prompts" USING btree ("user_id") WHERE "prompts"."is_default";