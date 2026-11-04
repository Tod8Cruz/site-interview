CREATE TABLE "question_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
-- 기존 질문은 주인(계정 기능 이전 행은 user_id가 null)마다 "기본" 그룹 하나로 모은다.
INSERT INTO "question_groups" ("user_id", "name", "is_default")
SELECT DISTINCT "user_id", '기본', true FROM "questions";--> statement-breakpoint
UPDATE "questions" q SET "group_id" = g."id"
FROM "question_groups" g
WHERE g."user_id" IS NOT DISTINCT FROM q."user_id";--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_groups_single_default" ON "question_groups" USING btree ("user_id") WHERE "question_groups"."is_default";--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_group_id_question_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."question_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_group_idx" ON "questions" USING btree ("group_id");