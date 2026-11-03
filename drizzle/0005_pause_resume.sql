CREATE TABLE "interview_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"mime_type" text NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_recordings_start_unique" UNIQUE("interview_id","start_ms")
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "current_question_index" integer;--> statement-breakpoint
ALTER TABLE "interview_recordings" ADD CONSTRAINT "interview_recordings_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "interview_recordings" ("interview_id", "start_ms", "duration_ms", "mime_type", "url", "pathname", "bytes")
SELECT "id", 0, coalesce("duration_ms", 0), CASE WHEN "audio_url" LIKE '%.m4a%' THEN 'audio/mp4' ELSE 'audio/webm' END, "audio_url", coalesce("audio_pathname", ''), coalesce("audio_bytes", 0)
FROM "interviews" WHERE "audio_url" IS NOT NULL;
