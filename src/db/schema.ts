import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { EvaluationResult, RubricCriterion } from "@/lib/evaluation";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** 로그인 계정. 이메일은 소문자로 정규화해 저장하고, 비밀번호는 scrypt 해시만 둔다. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

/**
 * 데이터를 가진 사용자. 계정 기능 이전에 만든 행은 null이고, 첫 가입자가 넘겨받는다(server/users.ts).
 * 코드는 항상 사용자 조건으로 조회하므로 null인 행은 아무에게도 보이지 않는다.
 */
const owner = () => uuid("user_id").references(() => users.id, { onDelete: "cascade" });

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    question: text("question").notNull(),
    modelAnswer: text("model_answer").notNull().default(""),
    category: text("category"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("questions_user_idx").on(t.userId)],
);

export type TurnDetectionType = "semantic_vad" | "server_vad";
export type VadEagerness = "low" | "medium" | "high" | "auto";

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
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
  (t) => [uniqueIndex("prompts_single_default").on(t.userId).where(sql`${t.isDefault}`)],
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
    userId: owner(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("candidate_profiles_single_default").on(t.userId).where(sql`${t.isDefault}`)],
);

/** 평가 기준(루브릭). 항목은 순서 있는 jsonb 배열이고, 평가할 때 통째로 스냅샷된다. */
export const evaluationRubrics = pgTable(
  "evaluation_rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    criteria: jsonb("criteria").$type<RubricCriterion[]>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("evaluation_rubrics_single_default").on(t.userId).where(sql`${t.isDefault}`)],
);

/** in_progress → paused → in_progress … → completed | aborted. paused는 통화가 없는 상태로, 비용이 들지 않는다. */
export type InterviewStatus = "in_progress" | "paused" | "completed" | "aborted";
export type AudioStatus = "none" | "pending" | "uploaded" | "failed";

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
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
    /** 현재(또는 마지막) 통화 구간이 연결된 시각. 재개할 때마다 다시 잡힌다. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** 마지막으로 일시정지한 시각. 재개하면 비운다. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** 누적 진행 시간(ms). 일시정지·종료 때 기록하며, 재개한 구간의 시계는 이 값에서 이어진다. */
    durationMs: integer("duration_ms"),
    /** 일시정지 시점에 진행 중이던 예상 질문 번호(0부터). 인사 단계면 null. */
    currentQuestionIndex: integer("current_question_index"),
    /** 모든 녹음 구간의 집계 상태 */
    audioStatus: text("audio_status").$type<AudioStatus>().notNull().default("none"),
    ...timestamps,
  },
  (t) => [index("interviews_status_idx").on(t.status), index("interviews_user_idx").on(t.userId, t.startedAt)],
);

/**
 * AI 평가 결과. 면접 하나당 하나이고 다시 평가하면 덮어쓴다.
 * 루브릭 이름·항목은 평가 시점 스냅샷이라 루브릭을 고치거나 지워도 결과는 그대로다.
 */
export const interviewEvaluations = pgTable("interview_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  interviewId: uuid("interview_id")
    .notNull()
    .unique()
    .references(() => interviews.id, { onDelete: "cascade" }),
  rubricId: uuid("rubric_id").references(() => evaluationRubrics.id, { onDelete: "set null" }),
  rubricName: text("rubric_name").notNull(),
  criteria: jsonb("criteria").$type<RubricCriterion[]>().notNull(),
  model: text("model").notNull(),
  result: jsonb("result").$type<EvaluationResult>().notNull(),
  ...timestamps,
});

/**
 * 녹음 구간. 통화 구간(시작~일시정지, 재개~종료)마다 파일 하나씩 Vercel Blob에 둔다.
 * start_ms는 누적 진행 시계에서 이 구간이 시작하는 지점이라, 턴의 start_ms로 구간을 찾을 수 있다.
 */
export const interviewRecordings = pgTable(
  "interview_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    /** 누적 시계에서 이 구간이 시작하는 지점. 구간의 식별자이기도 하다. */
    startMs: integer("start_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    mimeType: text("mime_type").notNull(),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("interview_recordings_start_unique").on(t.interviewId, t.startMs)],
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
    /** 이 턴이 속한 예상 질문 (면접 중 start_question 도구로 파악) */
    questionId: uuid("question_id").references(() => questions.id, { onDelete: "set null" }),
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
  userId: owner(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** 목록에서 어떤 토큰인지 알아보기 위한 앞부분 (예: mi_AbCd1234) */
  prefix: text("prefix").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 사용자별 설정(키-값). 비밀값(예: OpenAI API 키)은 서버에서 암호화해 넣는다. */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** 계정 기능 이전의 단일 계정 설정. 첫 가입자의 user_settings로 옮긴 뒤 비운다(server/users.ts). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InterviewTurn = typeof interviewTurns.$inferSelect;
export type InterviewRecording = typeof interviewRecordings.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type EvaluationRubric = typeof evaluationRubrics.$inferSelect;
export type InterviewEvaluation = typeof interviewEvaluations.$inferSelect;
