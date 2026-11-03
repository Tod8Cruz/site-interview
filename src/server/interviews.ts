import "server-only";
import { and, asc, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  interviewEvaluations,
  interviewRecordings,
  interviews,
  interviewTurns,
  questions,
  type Interview,
} from "@/db/schema";
import { estimateActiveMs, resumeQuestionIndex } from "@/lib/interview-time";
import { renderPrompt } from "@/lib/prompt-template";
import { questionProtocol } from "@/lib/realtime/question-protocol";
import {
  interviewCreateSchema,
  interviewPatchSchema,
  recordingSchema,
  turnNoteSchema,
  turnSchema,
  type InterviewCreateInput,
  type TurnInput,
} from "@/lib/validation";
import { getQuestionsByIds } from "./questions";
import { getProfile } from "./profiles";
import { getPrompt } from "./prompts";
import { deleteBlob, isBlobUrlFor, isRecordingPathname } from "./blob";
import { hangupCall } from "./realtime";

/** 5절 서버 쪽 비용 상한: 최대 시간 + 2분이 지나면 서버가 통화를 끊고 면접을 정리한다 */
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

const owned = (userId: string, id: string) => and(eq(interviews.userId, userId), eq(interviews.id, id));

/**
 * 이번 통화 구간의 시간 상한. duration_ms는 이전 구간까지의 누적 진행 시간이므로 그만큼 뺀다.
 * (startedAt은 재개할 때마다 연결 시점으로 다시 잡힌다.)
 */
const pastLimit = (graceMinutes: number) =>
  lt(
    sql`${interviews.startedAt} + make_interval(secs => (((${interviews.maxMinutes} + ${graceMinutes}) * 60 - coalesce(${interviews.durationMs}, 0) / 1000.0))::double precision)`,
    sql`now()`,
  );

/**
 * 5절 서버 쪽 비용 상한 + I-6 방치 정리: 최대 시간 + 2분이 지났는데 아직 진행 중인 면접은 통화를 끊고,
 * 턴 기록으로 진행 시간을 추정해 일시정지로 돌린다(연결 끊김·탭 닫힘도 일시정지로 본다).
 * 시간을 다 쓴 면접은 완료로, 아무 대화도 없는 면접은 중단으로 정리한다.
 * cron에서도 부르므로 모든 사용자의 면접을 보고, 통화는 각 면접 주인의 키로 끊는다.
 */
export async function settleAbandonedInterviews() {
  const abandoned = await db
    .select({
      id: interviews.id,
      userId: interviews.userId,
      callId: interviews.realtimeCallId,
      durationMs: interviews.durationMs,
      maxMinutes: interviews.maxMinutes,
      currentQuestionIndex: interviews.currentQuestionIndex,
      questionIds: interviews.questionIds,
    })
    .from(interviews)
    .where(and(eq(interviews.status, "in_progress"), pastLimit(HANGUP_GRACE_MINUTES)));
  await Promise.all(
    abandoned.map(async (row) => {
      if (row.callId && row.userId) await hangupCall(row.userId, row.callId);
      const turns = await getInterviewTurns(row.id);
      const activeMs = estimateActiveMs(row.durationMs, turns);
      const limitMs = row.maxMinutes * 60_000;
      const status = turns.length === 0 && activeMs === 0 ? "aborted" : activeMs >= limitMs ? "completed" : "paused";
      await db
        .update(interviews)
        .set({
          status,
          realtimeCallId: null,
          durationMs: Math.min(activeMs, limitMs),
          currentQuestionIndex: resumeQuestionIndex(row.currentQuestionIndex, turns, row.questionIds),
          ...(status === "paused" ? { pausedAt: sql`now()` } : { endedAt: sql`now()` }),
        })
        .where(and(eq(interviews.id, row.id), eq(interviews.status, "in_progress")));
    }),
  );
  return abandoned.length;
}

export async function listInterviews(userId: string) {
  await settleAbandonedInterviews();
  return db
    .select({
      id: interviews.id,
      title: interviews.title,
      status: interviews.status,
      promptName: interviews.promptName,
      startedAt: interviews.startedAt,
      durationMs: interviews.durationMs,
      maxMinutes: interviews.maxMinutes,
      currentQuestionIndex: interviews.currentQuestionIndex,
      audioStatus: interviews.audioStatus,
      questionCount: sql<number>`cardinality(${interviews.questionIds})`,
      // select 필드 안에서 drizzle은 자기 테이블 컬럼을 테이블 이름 없이("id") 그리므로, 서브쿼리에서 바깥 테이블은 글자로 적는다.
      evaluated: sql<boolean>`exists(select 1 from ${interviewEvaluations} e where e.interview_id = interviews.id)`,
    })
    .from(interviews)
    .where(eq(interviews.userId, userId))
    .orderBy(desc(interviews.startedAt));
}

/** 이 사용자의 면접. 턴·녹음·평가처럼 면접 아래에 딸린 데이터는 이 함수로 주인을 확인한 뒤 다룬다. */
export async function getInterview(userId: string, id: string) {
  const [row] = await db.select().from(interviews).where(owned(userId, id));
  return row ?? null;
}

export async function getInterviewTurns(id: string) {
  return db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.interviewId, id))
    .orderBy(asc(interviewTurns.startMs), asc(interviewTurns.createdAt));
}

/** 녹음 구간을 재생 순서로 */
export async function getInterviewRecordings(id: string) {
  return db
    .select()
    .from(interviewRecordings)
    .where(eq(interviewRecordings.interviewId, id))
    .orderBy(asc(interviewRecordings.startMs));
}

/** 녹음 구간 하나. 호출자가 면접 주인을 확인한다. */
export async function getInterviewRecording(interviewId: string, recordingId: string) {
  const [row] = await db
    .select()
    .from(interviewRecordings)
    .where(and(eq(interviewRecordings.interviewId, interviewId), eq(interviewRecordings.id, recordingId)));
  return row ?? null;
}

/** 진행 중(통화가 열려 있을 수 있는) 면접. 사용자마다 한 번에 하나만 허용한다. */
export async function findRunningInterview(userId: string) {
  const [running] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(eq(interviews.userId, userId), eq(interviews.status, "in_progress")))
    .limit(1);
  return running ?? null;
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

export async function createInterview(userId: string, input: InterviewCreateInput) {
  const data = interviewCreateSchema.parse(input);
  await settleAbandonedInterviews();

  // 일시정지된 면접은 통화가 없으므로 막지 않는다. 진행 중인 면접만 하나로 제한한다.
  const running = await findRunningInterview(userId);
  if (running) throw new ConflictError("진행 중인 면접이 있습니다.", running.id);

  const prompt = await getPrompt(userId, data.promptId);
  if (!prompt) throw new NotFoundError("프롬프트를 찾을 수 없습니다.");

  const profile = data.candidateProfileId ? await getProfile(userId, data.candidateProfileId) : null;
  if (data.candidateProfileId && !profile) throw new NotFoundError("지원자 정보를 찾을 수 없습니다.");
  const context = profile?.content ?? data.context;

  const selected = await getQuestionsByIds(userId, data.questionIds);
  const source = data.sourceInterviewId ? await getInterview(userId, data.sourceInterviewId) : null;
  const maxMinutes = data.maxMinutes ?? prompt.maxMinutes;
  // 질문 진행 프로토콜은 사용자가 고치는 프롬프트와 별개로 항상 붙인다(스냅샷에도 남도록 생성 시점에).
  const instructions =
    renderPrompt(prompt.content, { questions: selected, context, maxMinutes }) + questionProtocol(selected.length);

  const now = new Date();
  const [row] = await db
    .insert(interviews)
    .values({
      userId,
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
      sourceInterviewId: source?.id ?? null,
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
      voice: data.voice ?? prompt.voice,
      maxMinutes,
      startedAt: now,
    })
    .returning();
  return row;
}

/**
 * 상태 전이: in_progress|paused → paused|completed|aborted. 끝난 면접은 바꿀 수 없다.
 * 상태가 바뀌면 서버에서도 통화를 끊는다(이미 끊긴 통화면 아무 일도 없다).
 * 일시정지 요청에 진행 시간·질문 번호가 없으면(탭이 죽은 뒤 다른 곳에서 정리하는 경우) 턴 기록으로 추정한다.
 */
export async function patchInterview(userId: string, id: string, input: unknown) {
  const data = interviewPatchSchema.parse(input);
  const current = await getInterview(userId, id);
  if (!current) return null;
  const set: Partial<Interview> = { ...data };
  let callId: string | null = null;
  if (data.status) {
    if (current.status === "completed" || current.status === "aborted") {
      throw new ConflictError("이미 끝난 면접입니다.", id);
    }
    callId = current.realtimeCallId;
    set.realtimeCallId = null;
    const needsEstimate = data.durationMs === undefined || (data.status === "paused" && data.currentQuestionIndex === undefined);
    const turns = needsEstimate ? await getInterviewTurns(id) : [];
    if (data.durationMs === undefined) set.durationMs = estimateActiveMs(current.durationMs, turns);
    if (data.status === "paused") {
      set.pausedAt = new Date();
      if (data.currentQuestionIndex === undefined) {
        set.currentQuestionIndex = resumeQuestionIndex(current.currentQuestionIndex, turns, current.questionIds);
      }
    } else {
      set.endedAt = new Date();
    }
  }
  const [row] = await db.update(interviews).set(set).where(owned(userId, id)).returning();
  if (row && callId) await hangupCall(userId, callId);
  return row ?? null;
}

/** 녹음 구간 업로드 결과를 기록한다. 같은 구간을 다시 올리면 덮어쓰고 이전 파일은 지운다. 호출자가 면접 주인을 확인한다. */
export async function saveRecording(interviewId: string, input: unknown) {
  // 남의 면접 파일을 자기 면접에 등록해 재생 URL을 받아 가지 못하게, 경로와 URL이 이 면접의 것인지 본다.
  const data = recordingSchema
    .refine((r) => isRecordingPathname(interviewId, r.pathname) && isBlobUrlFor(r.url, r.pathname), {
      message: "녹음 파일 경로가 이 면접과 맞지 않습니다.",
      path: ["pathname"],
    })
    .parse(input);
  const [previous] = await db
    .select({ url: interviewRecordings.url })
    .from(interviewRecordings)
    .where(and(eq(interviewRecordings.interviewId, interviewId), eq(interviewRecordings.startMs, data.startMs)));
  const [row] = await db
    .insert(interviewRecordings)
    .values({ ...data, interviewId })
    .onConflictDoUpdate({
      target: [interviewRecordings.interviewId, interviewRecordings.startMs],
      set: { durationMs: data.durationMs, mimeType: data.mimeType, url: data.url, pathname: data.pathname, bytes: data.bytes },
    })
    .returning();
  await db.update(interviews).set({ audioStatus: "uploaded" }).where(eq(interviews.id, interviewId));
  if (previous && previous.url !== data.url) await deleteBlob(previous.url);
  return row;
}

export async function updateTurnNote(userId: string, interviewId: string, turnId: string, input: unknown) {
  const data = turnNoteSchema.parse(input);
  if (!(await getInterview(userId, interviewId))) return null;
  if (data.noteQuestionId) {
    const [question] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.userId, userId), eq(questions.id, data.noteQuestionId)));
    if (!question) throw new NotFoundError("연결할 질문을 찾을 수 없습니다.");
  }
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

/** 호출자가 면접 주인과 questionId(이 면접의 질문인지)를 확인한다. */
export async function saveTurn(interviewId: string, input: TurnInput) {
  const data = turnSchema.parse(input);
  const values = {
    ...data,
    interviewId,
    endMs: data.endMs ?? null,
    itemId: data.itemId ?? null,
    questionId: data.questionId ?? null,
  };
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
            questionId: values.questionId,
          },
        })
        .returning()
    : await query.returning();
  return row;
}

export async function deleteInterview(userId: string, id: string) {
  if (!(await getInterview(userId, id))) return false;
  const recordings = await getInterviewRecordings(id);
  const [row] = await db.delete(interviews).where(owned(userId, id)).returning();
  if (!row) return false;
  if (row.realtimeCallId) await hangupCall(userId, row.realtimeCallId);
  await Promise.all(recordings.map((r) => deleteBlob(r.url)));
  return true;
}
