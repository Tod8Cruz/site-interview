import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { interviews } from "@/db/schema";
import { buildRealtimeSession, hangupCall, OPENAI_BASE_URL } from "@/server/realtime";
import { checkSession, isUuid, jsonError } from "@/server/http";
import { findRunningInterview, getInterview } from "@/server/interviews";
import { OPENAI_NOT_CONFIGURED_MESSAGE } from "@/server/openai";
import { getOpenAIApiKey } from "@/server/settings";

/**
 * R-1: 브라우저의 SDP offer를 받아 서버가 OpenAI에 대신 전달한다(unified 방식).
 * OpenAI API 키는 로그인한 사용자가 설정에 등록한 키(DB, 암호화)를 읽으며 브라우저에 노출되지 않고, 서버는 call id를 얻어 저장한다(서버 쪽 종료용).
 */
export async function POST(request: Request) {
  const { userId, denied } = await checkSession();
  if (denied) return denied;
  const apiKey = await getOpenAIApiKey(userId);
  if (!apiKey) return jsonError(503, "openai_not_configured", OPENAI_NOT_CONFIGURED_MESSAGE);

  const interviewId = new URL(request.url).searchParams.get("interviewId") ?? "";
  if (!isUuid(interviewId)) return jsonError(400, "bad_request", "interviewId가 필요합니다.");
  const interview = await getInterview(userId, interviewId);
  if (!interview) return jsonError(404, "not_found", "면접을 찾을 수 없습니다.");
  if (interview.status !== "in_progress" && interview.status !== "paused") {
    return jsonError(409, "conflict", "이미 끝난 면접입니다.");
  }
  // 통화가 살아 있는 면접에 다시 붙는 것은 지원하지 않는다(시간 제한이 무력해진다). 이전 통화를 끊고 거부하면
  // 화면이 "연결이 끊겼습니다 → 이어하기"로 안내한다.
  if (interview.realtimeCallId) {
    await hangupCall(userId, interview.realtimeCallId);
    return jsonError(409, "already_started", "이미 시작된 면접입니다. 연결이 끊긴 뒤 다시 들어온 것이라면 일시정지한 뒤 이어하기를 눌러 주세요.");
  }
  const resume = interview.status === "paused";
  if (resume) {
    const running = await findRunningInterview(userId);
    if (running) return jsonError(409, "conflict", "진행 중인 다른 면접이 있습니다.", { interviewId: running.id });
  }

  const sdp = await request.text();
  if (!sdp.startsWith("v=")) return jsonError(400, "bad_request", "SDP offer가 필요합니다.");

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(buildRealtimeSession(interview, { resume })));

  const response = await fetch(`${OPENAI_BASE_URL()}/realtime/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const answer = await response.text();
  if (!response.ok) {
    console.error("OpenAI realtime call failed", response.status, answer);
    return jsonError(502, "openai_error", `OpenAI 연결에 실패했습니다 (${response.status}).`);
  }

  // 구간 시작 시각은 실제 연결 시점으로 다시 잡는다(시간 상한·방치 판정 기준).
  // 두 탭이 동시에 연결하면 한쪽만 통과하도록 "통화 없음" 조건을 걸고 갱신한다.
  const callId = response.headers.get("location")?.split("/").pop() ?? null;
  const [claimed] = await db
    .update(interviews)
    .set({ realtimeCallId: callId, startedAt: new Date(), status: "in_progress", pausedAt: null })
    .where(
      and(eq(interviews.id, interviewId), eq(interviews.userId, userId), isNull(interviews.realtimeCallId), inArray(interviews.status, ["in_progress", "paused"])),
    )
    .returning({ id: interviews.id });
  if (!claimed) {
    if (callId) await hangupCall(userId, callId);
    return jsonError(409, "already_started", "다른 탭에서 이미 이 면접을 시작했습니다.");
  }
  return new Response(answer, { headers: { "Content-Type": "application/sdp" } });
}
