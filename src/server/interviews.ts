import "server-only";
import { del } from "@vercel/blob";
import { and, asc, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { interviews, interviewTurns, type Interview } from "@/db/schema";
import { renderPrompt } from "@/lib/prompt-template";
import {
  interviewCreateSchema,
  interviewPatchSchema,
  turnNoteSchema,
  turnSchema,
  type InterviewCreateInput,
  type TurnInput,
} from "@/lib/validation";
import { getQuestionsByIds } from "./questions";
import { getProfile } from "./profiles";
import { getPrompt } from "./prompts";
import { hangupCall } from "./realtime";

/** I-6: 비정상 종료로 방치된 면접의 유예 시간 */
const STALE_GRACE_MINUTES = 5;
/** 5절 서버 쪽 비용 상한: 최대 시간 + 2분이 지나면 서버가 통화를 끊는다 */
const HANGUP_GRACE_MINUTES = 2;

export class ConflictError extends Error {
  constructor(
    message: string,
    public readonly interviewId: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends Error {}

const pastLimit = (graceMinutes: number) =>
  lt(sql`${interviews.startedAt} + make_interval(mins => ${interviews.maxMinutes} + ${graceMinutes})`, sql`now()`);

/**
 * 5절 서버 쪽 비용 상한: 최대 시간 + 2분이 지났는데 아직 통화 중인 면접은 서버가 끊는다.
 * 클라이언트 타이머가 멈춘 경우(탭 정지, 크래시)에도 비용이 계속 나가지 않게 한다.
 */
export async function hangupOverdueCalls() {
  const overdue = await db
    .select({ id: interviews.id, callId: interviews.realtimeCallId })
    .from(interviews)
    .where(and(eq(interviews.status, "in_progress"), isNotNull(interviews.realtimeCallId), pastLimit(HANGUP_GRACE_MINUTES)));
  await Promise.all(
    overdue.map(async ({ id, callId }) => {
      await hangupCall(callId!);
      await db
        .update(interviews)
        .set({ status: "aborted", endedAt: sql`now()`, realtimeCallId: null })
        .where(eq(interviews.id, id));
    }),
  );
  return overdue.length;
}

/** I-6: started_at + max_minutes + 5분이 지난 in_progress 면접을 aborted로 바꾼다. */
export async function abortStaleInterviews() {
  await hangupOverdueCalls();
  await db
    .update(interviews)
    .set({ status: "aborted", endedAt: sql`now()` })
    .where(
      and(
        eq(interviews.status, "in_progress"),
        pastLimit(STALE_GRACE_MINUTES),
      ),
    );
}

export async function listInterviews() {
  await abortStaleInterviews();
  return db
    .select({
      id: interviews.id,
      title: interviews.title,
      status: interviews.status,
      promptName: interviews.promptName,
      startedAt: interviews.startedAt,
      durationMs: interviews.durationMs,
      audioStatus: interviews.audioStatus,
      questionCount: sql<number>`cardinality(${interviews.questionIds})`,
    })
    .from(interviews)
    .orderBy(desc(interviews.startedAt));
}

export async function getInterview(id: string) {
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id));
  return row ?? null;
}

export async function getInterviewTurns(id: string) {
  return db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.interviewId, id))
    .orderBy(asc(interviewTurns.startMs), asc(interviewTurns.createdAt));
}

function defaultTitle(date: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} 모의면접`;
}

export async function createInterview(input: InterviewCreateInput) {
  const data = interviewCreateSchema.parse(input);
  await abortStaleInterviews();

  const [running] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(eq(interviews.status, "in_progress"))
    .limit(1);
  if (running) throw new ConflictError("진행 중인 면접이 있습니다.", running.id);

  const prompt = await getPrompt(data.promptId);
  if (!prompt) throw new NotFoundError("프롬프트를 찾을 수 없습니다.");

  const profile = data.candidateProfileId ? await getProfile(data.candidateProfileId) : null;
  if (data.candidateProfileId && !profile) throw new NotFoundError("지원자 정보를 찾을 수 없습니다.");
  const context = profile?.content ?? data.context;

  const selected = await getQuestionsByIds(data.questionIds);
  const maxMinutes = data.maxMinutes ?? prompt.maxMinutes;
  const instructions = renderPrompt(prompt.content, {
    questions: selected,
    context,
    maxMinutes,
  });

  const now = new Date();
  const [row] = await db
    .insert(interviews)
    .values({
      title: defaultTitle(now),
      status: "in_progress",
      promptId: prompt.id,
      promptName: prompt.name,
      instructions,
      turnDetection: {
        type: prompt.turnDetection,
        eagerness: prompt.vadEagerness,
        silenceMs: prompt.silenceMs,
      },
      context,
      candidateProfileId: profile?.id ?? null,
      questionIds: selected.map((q) => q.id),
      sourceInterviewId: data.sourceInterviewId ?? null,
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
      voice: data.voice ?? prompt.voice,
      maxMinutes,
      startedAt: now,
    })
    .returning();
  return row;
}

/** 면접이 끝나면(completed/aborted) 서버에서도 통화를 끊는다. 이미 끊긴 통화면 아무 일도 없다. */
export async function patchInterview(id: string, input: unknown) {
  const data = interviewPatchSchema.parse(input);
  const set: Partial<Interview> = { ...data };
  let callId: string | null = null;
  if (data.status) {
    set.endedAt = new Date();
    set.realtimeCallId = null;
    const current = await getInterview(id);
    callId = current?.status === "in_progress" ? current.realtimeCallId : null;
  }
  const [row] = await db.update(interviews).set(set).where(eq(interviews.id, id)).returning();
  if (row && callId) await hangupCall(callId);
  return row ?? null;
}

export async function updateTurnNote(interviewId: string, turnId: string, input: unknown) {
  const data = turnNoteSchema.parse(input);
  const [row] = await db
    .update(interviewTurns)
    .set({ note: data.note?.trim() ? data.note : null, noteQuestionId: data.noteQuestionId ?? null })
    .where(and(eq(interviewTurns.id, turnId), eq(interviewTurns.interviewId, interviewId)))
    .returning();
  return row ?? null;
}

/** L-14: 메모를 남긴 턴에 연결된 질문 ID (중복 제거, 등장 순서 유지) */
export async function getNotedQuestionIds(interviewId: string) {
  const rows = await db
    .select({ questionId: interviewTurns.noteQuestionId })
    .from(interviewTurns)
    .where(
      and(
        eq(interviewTurns.interviewId, interviewId),
        isNotNull(interviewTurns.note),
        isNotNull(interviewTurns.noteQuestionId),
      ),
    )
    .orderBy(asc(interviewTurns.startMs));
  return Array.from(new Set(rows.map((r) => r.questionId!)));
}

export async function saveTurn(interviewId: string, input: TurnInput) {
  const data = turnSchema.parse(input);
  const values = { ...data, interviewId, endMs: data.endMs ?? null, itemId: data.itemId ?? null };
  const query = db.insert(interviewTurns).values(values);
  // 같은 item_id는 한 번만 저장하되, 늦게 도착한 전사·끝 시각은 반영한다.
  const [row] = data.itemId
    ? await query
        .onConflictDoUpdate({
          target: [interviewTurns.interviewId, interviewTurns.itemId],
          set: {
            text: values.text,
            startMs: values.startMs,
            endMs: values.endMs,
            interrupted: values.interrupted,
          },
        })
        .returning()
    : await query.returning();
  return row;
}

export async function deleteInterview(id: string) {
  const [row] = await db.delete(interviews).where(eq(interviews.id, id)).returning();
  if (row?.audioUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(row.audioUrl).catch((error) => console.error("blob delete failed", error));
  }
  return Boolean(row);
}
