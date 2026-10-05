import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interviews } from "@/db/schema";
import { buildRealtimeSession, hangupCall, OPENAI_BASE_URL } from "@/server/realtime";
import { isUuid, jsonError } from "@/server/http";
import { getInterview } from "@/server/interviews";


/**
 * R-1: 브라우저의 SDP offer를 받아 서버가 OpenAI에 대신 전달한다(unified 방식).
 * OpenAI API 키는 브라우저에 노출되지 않고, 서버는 call id를 얻어 저장한다(서버 쪽 종료용).
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError(503, "openai_not_configured", "OPENAI_API_KEY가 설정되지 않았습니다.");

  const interviewId = new URL(request.url).searchParams.get("interviewId") ?? "";
  if (!isUuid(interviewId)) return jsonError(400, "bad_request", "interviewId가 필요합니다.");
  const interview = await getInterview(interviewId);
  if (!interview) return jsonError(404, "not_found", "면접을 찾을 수 없습니다.");
  if (interview.status !== "in_progress") return jsonError(409, "conflict", "이미 끝난 면접입니다.");
  // R-10: 재연결은 지원하지 않는다. 새로고침 등으로 다시 연결하면 최대 시간 제한이 무력해지므로
  // 이전 통화를 끊고 거부한다.
  if (interview.realtimeCallId) {
    await hangupCall(interview.realtimeCallId);
    return jsonError(409, "already_started", "이미 시작된 면접입니다. 같은 질문으로 새 면접을 시작해 주세요.");
  }

  const sdp = await request.text();
  if (!sdp.startsWith("v=")) return jsonError(400, "bad_request", "SDP offer가 필요합니다.");

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(buildRealtimeSession(interview)));

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

  // 면접 시작 시각은 실제 연결 시점으로 다시 잡는다(I-6 방치 판정 기준).
  const callId = response.headers.get("location")?.split("/").pop() ?? null;
  await db
    .update(interviews)
    .set({ realtimeCallId: callId, startedAt: new Date() })
    .where(eq(interviews.id, interviewId));
  return new Response(answer, { headers: { "Content-Type": "application/sdp" } });
}
