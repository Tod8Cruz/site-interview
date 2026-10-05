import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  modelAnswer: text("model_answer").notNull().default(""),
  category: text("category"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export type TurnDetectionType = "semantic_vad" | "server_vad";
export type VadEagerness = "low" | "medium" | "high" | "auto";

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    voice: text("voice").notNull().default("marin"),
    maxMinutes: integer("max_minutes").notNull().default(20),
    turnDetection: text("turn_detection").$type<TurnDetectionType>().notNull().default("semantic_vad"),
    vadEagerness: text("vad_eagerness").$type<VadEagerness>().notNull().default("low"),
    silenceMs: integer("silence_ms").notNull().default(1500),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("prompts_single_default").on(t.isDefault).where(sql`${t.isDefault}`)],
);

/** 면접 시작 시점의 턴 감지 설정 스냅샷 (P-5) */
export type TurnDetectionSnapshot = {
  type: TurnDetectionType;
  eagerness: VadEagerness;
  silenceMs: number;
};

/** 지원자 정보 프로필 — 설정에서 관리하고 면접 시작 시 골라 {{context}}로 쓴다. */
export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("candidate_profiles_single_default").on(t.isDefault).where(sql`${t.isDefault}`)],
);

export type InterviewStatus = "in_progress" | "completed" | "aborted";
export type AudioStatus = "none" | "pending" | "uploaded" | "failed";

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    status: text("status").$type<InterviewStatus>().notNull().default("in_progress"),
    promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    promptName: text("prompt_name").notNull(),
    instructions: text("instructions").notNull(),
    turnDetection: jsonb("turn_detection").$type<TurnDetectionSnapshot>().notNull(),
    /** 면접 시작 시점의 지원자 정보 스냅샷 */
    context: text("context").notNull().default(""),
    candidateProfileId: uuid("candidate_profile_id").references(() => candidateProfiles.id, {
      onDelete: "set null",
    }),
    questionIds: uuid("question_ids").array().notNull().default(sql`'{}'::uuid[]`),
    sourceInterviewId: uuid("source_interview_id").references((): AnyPgColumn => interviews.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    voice: text("voice").notNull(),
    maxMinutes: integer("max_minutes").notNull(),
    realtimeCallId: text("realtime_call_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    audioStatus: text("audio_status").$type<AudioStatus>().notNull().default("none"),
    audioUrl: text("audio_url"),
    audioPathname: text("audio_pathname"),
    audioBytes: integer("audio_bytes"),
    ...timestamps,
  },
  (t) => [index("interviews_status_idx").on(t.status)],
);

export type TurnRole = "interviewer" | "candidate";

export const interviewTurns = pgTable(
  "interview_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    role: text("role").$type<TurnRole>().notNull(),
    text: text("text").notNull(),
    /** 녹음 기준 시계(AudioContext.currentTime - t0) 밀리초 */
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms"),
    itemId: text("item_id"),
    interrupted: boolean("interrupted").notNull().default(false),
    note: text("note"),
    noteQuestionId: uuid("note_question_id").references(() => questions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("interview_turns_item_unique").on(t.interviewId, t.itemId),
    index("interview_turns_order_idx").on(t.interviewId, t.startMs),
  ],
);

/** 질문 API용 토큰. 원문은 발급 때 한 번만 보여 주고 SHA-256 해시만 저장한다. */
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** 목록에서 어떤 토큰인지 알아보기 위한 앞부분 (예: mi_AbCd1234) */
  prefix: text("prefix").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Question = typeof questions.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InterviewTurn = typeof interviewTurns.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
