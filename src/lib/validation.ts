import { z } from "zod";

export const questionCreateSchema = z.object({
  /** 비우면 기본 그룹에 들어간다. */
  groupId: z.uuid().optional(),
  question: z.string().trim().min(1, "질문을 입력하세요.").max(1000),
  modelAnswer: z.string().max(20000).default(""),
  sortOrder: z.number().int().default(0),
});

export const questionUpdateSchema = z
  .object({
    groupId: z.uuid(),
    question: z.string().trim().min(1, "질문을 입력하세요.").max(1000),
    modelAnswer: z.string().max(20000),
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
  groupId: z.uuid().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const questionGroupSchema = z.object({
  name: z.string().trim().min(1, "그룹 이름을 입력하세요.").max(100),
});

/** 그룹 생성. isDefault: true면 만든 뒤 기본 그룹으로 올린다. */
export const questionGroupCreateSchema = questionGroupSchema.extend({ isDefault: z.boolean().default(false) });

export type QuestionGroupCreateInput = z.input<typeof questionGroupCreateSchema>;

/** 그룹 수정. isDefault는 true로만 바꿀 수 있다(해제는 다른 그룹을 기본값으로). */
export const questionGroupUpdateSchema = questionGroupSchema
  .extend({ isDefault: z.literal(true, "isDefault는 true만 보낼 수 있습니다. 기본 그룹을 바꾸려면 다른 그룹에 true를 보내세요.") })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다.");

export type QuestionGroupUpdateInput = z.input<typeof questionGroupUpdateSchema>;

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

/** 프롬프트 생성(API). 이름·내용만 필수이고 나머지는 기본값. isDefault: true면 만든 뒤 기본값으로 올린다. */
export const promptCreateSchema = promptSchema.extend({
  voice: promptSchema.shape.voice.default("marin"),
  maxMinutes: promptSchema.shape.maxMinutes.default(20),
  turnDetection: promptSchema.shape.turnDetection.default("semantic_vad"),
  vadEagerness: promptSchema.shape.vadEagerness.default("low"),
  silenceMs: promptSchema.shape.silenceMs.default(1500),
  isDefault: z.boolean().default(false),
});

export type PromptCreateInput = z.input<typeof promptCreateSchema>;

/** 프롬프트 일부 수정. 보낸 필드만 바뀐다. isDefault는 true로만 바꿀 수 있다(해제는 다른 것을 기본값으로). */
export const promptUpdateSchema = promptSchema
  .extend({ isDefault: z.literal(true, "isDefault는 true만 보낼 수 있습니다. 기본값을 바꾸려면 다른 프롬프트에 true를 보내세요.") })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다.");

export type PromptUpdateInput = z.input<typeof promptUpdateSchema>;

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
    status: z.enum(["paused", "completed", "aborted"]),
    /** 누적 진행 시간 */
    durationMs: z.number().int().min(0),
    currentQuestionIndex: z.number().int().min(0).nullable(),
    audioStatus: z.enum(["none", "pending", "uploaded", "failed"]),
  })
  .partial();

export const recordingSchema = z.object({
  startMs: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  mimeType: z.string().max(100),
  url: z.url(),
  pathname: z.string().max(500),
  bytes: z.number().int().min(0),
});

export type RecordingInput = z.input<typeof recordingSchema>;

export const turnSchema = z.object({
  role: z.enum(["interviewer", "candidate"]),
  text: z.string().max(20000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0).nullish(),
  itemId: z.string().max(200).nullish(),
  interrupted: z.boolean().default(false),
  questionId: z.uuid().nullish(),
});

export type TurnInput = z.input<typeof turnSchema>;

export const turnNoteSchema = z.object({
  note: z.string().max(5000).nullish(),
  noteQuestionId: z.uuid().nullish(),
});

export const PASSWORD_MIN_LENGTH = 8;

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("이메일 형식이 올바르지 않습니다.").max(254)),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
    .max(200, "비밀번호가 너무 깁니다."),
});

export type SignupInput = z.input<typeof signupSchema>;

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

/** 평가 기준 항목. id가 없으면(새 행) 서버가 붙인다. */
export const rubricCriterionSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "항목 이름을 입력하세요.").max(100),
    description: z.string().trim().max(1000).default(""),
  })
  .transform((c) => ({ ...c, id: c.id ?? crypto.randomUUID() }));

export const rubricSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력하세요.").max(100),
    criteria: z.array(rubricCriterionSchema).min(1, "평가 항목을 하나 이상 추가하세요.").max(20, "평가 항목은 20개까지입니다."),
  })
  .refine((r) => new Set(r.criteria.map((c) => c.id)).size === r.criteria.length, "항목 id가 중복됩니다.");

export type RubricInput = z.input<typeof rubricSchema>;

const rubricCriteria = rubricSchema.shape.criteria;
const uniqueCriterionIds = (criteria: { id: string }[]) => new Set(criteria.map((c) => c.id)).size === criteria.length;

/** 평가 기준 생성(API). isDefault: true면 만든 뒤 기본값으로 올린다. */
export const rubricCreateSchema = z
  .object({
    name: rubricSchema.shape.name,
    criteria: rubricCriteria,
    isDefault: z.boolean().default(false),
  })
  .refine((r) => uniqueCriterionIds(r.criteria), "항목 id가 중복됩니다.");

export type RubricCreateInput = z.input<typeof rubricCreateSchema>;

/** 평가 기준 일부 수정. criteria는 배열 전체를 바꾼다. isDefault는 true로만 바꿀 수 있다. */
export const rubricUpdateSchema = z
  .object({
    name: rubricSchema.shape.name,
    criteria: rubricCriteria,
    isDefault: z.literal(true, "isDefault는 true만 보낼 수 있습니다. 기본값을 바꾸려면 다른 평가 기준에 true를 보내세요."),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다.")
  .refine((v) => !v.criteria || uniqueCriterionIds(v.criteria), "항목 id가 중복됩니다.");

export type RubricUpdateInput = z.input<typeof rubricUpdateSchema>;

export const evaluationRunSchema = z.object({
  /** 비우면 기본 평가 기준 */
  rubricId: z.uuid().nullish(),
});
