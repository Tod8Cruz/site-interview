import { z } from "zod";

const optionalCategory = z
  .string()
  .trim()
  .max(100)
  .nullish()
  .transform((v) => (v ? v : null));

const tags = z
  .array(z.string().trim().min(1).max(50))
  .max(20)
  .transform((list) => Array.from(new Set(list)));

export const questionCreateSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력하세요.").max(1000),
  modelAnswer: z.string().max(20000).default(""),
  category: optionalCategory,
  tags: tags.default([]),
  sortOrder: z.number().int().default(0),
});

export const questionUpdateSchema = z
  .object({
    question: z.string().trim().min(1, "질문을 입력하세요.").max(1000),
    modelAnswer: z.string().max(20000),
    category: optionalCategory,
    tags,
    sortOrder: z.number().int(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다.");

export type QuestionCreateInput = z.input<typeof questionCreateSchema>;
export type QuestionUpdateInput = z.input<typeof questionUpdateSchema>;

/** 일괄 생성 (AI가 예상 질문을 여러 개 한꺼번에 넣을 때) */
export const questionBulkCreateSchema = z.object({
  items: z.array(questionCreateSchema).min(1, "items가 비어 있습니다.").max(100),
});

export type QuestionBulkCreateInput = z.input<typeof questionBulkCreateSchema>;

export const questionListQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export const promptSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(100),
  content: z.string().trim().min(1, "프롬프트를 입력하세요.").max(20000),
  voice: z.enum(VOICES),
  maxMinutes: z.coerce.number().int().min(1).max(60),
  turnDetection: z.enum(["semantic_vad", "server_vad"]),
  vadEagerness: z.enum(["low", "medium", "high", "auto"]),
  silenceMs: z.coerce.number().int().min(200).max(5000),
});

export type PromptInput = z.input<typeof promptSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(100),
  content: z.string().trim().min(1, "지원자 정보를 입력하세요.").max(10000),
});

export type ProfileInput = z.input<typeof profileSchema>;

export const interviewCreateSchema = z.object({
  promptId: z.uuid(),
  /** 지정하면 서버가 프로필 내용을 지원자 정보로 쓴다(context보다 우선). */
  candidateProfileId: z.uuid().nullish(),
  questionIds: z.array(z.uuid()).max(200).default([]),
  context: z.string().max(10000).default(""),
  voice: z.enum(VOICES).optional(),
  maxMinutes: z.number().int().min(1).max(60).optional(),
  sourceInterviewId: z.uuid().nullish(),
});

export type InterviewCreateInput = z.input<typeof interviewCreateSchema>;

export const interviewPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    status: z.enum(["completed", "aborted"]),
    durationMs: z.number().int().min(0),
    realtimeCallId: z.string().max(200),
    audioStatus: z.enum(["none", "pending", "uploaded", "failed"]),
    audioUrl: z.url(),
    audioPathname: z.string().max(500),
    audioBytes: z.number().int().min(0),
  })
  .partial();

export const turnSchema = z.object({
  role: z.enum(["interviewer", "candidate"]),
  text: z.string().max(20000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0).nullish(),
  itemId: z.string().max(200).nullish(),
  interrupted: z.boolean().default(false),
});

export type TurnInput = z.input<typeof turnSchema>;

export const turnNoteSchema = z.object({
  note: z.string().max(5000).nullish(),
  noteQuestionId: z.uuid().nullish(),
});

export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(100),
  /** 비우면 만료 없음 */
  expiresInDays: z.coerce
    .number()
    .int()
    .refine((v) => (API_TOKEN_EXPIRY_DAYS as readonly number[]).includes(v), "만료 기간이 올바르지 않습니다.")
    .nullish(),
});

export type ApiTokenCreateInput = z.input<typeof apiTokenCreateSchema>;

export function formatZodError(error: z.ZodError) {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}
