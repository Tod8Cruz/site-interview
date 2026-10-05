import "server-only";
import type { Interview } from "@/db/schema";
import { startQuestionTool } from "@/lib/realtime/question-protocol";
import { OPENAI_BASE_URL } from "./openai";
import { getOpenAIApiKey } from "./settings";

/** R-4: 전사 모델이 군말을 지우는 경향이 있어 그대로 적도록 지시한다(효과는 실측 필요). */
const TRANSCRIPTION_PROMPT =
  "면접 답변을 들리는 그대로 받아 적으세요. '어', '음', '그', '저기' 같은 군말과 반복도 지우지 말고 그대로 적으세요.";

function turnDetection(snapshot: Interview["turnDetection"]) {
  if (snapshot.type === "server_vad") {
    return {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: snapshot.silenceMs,
      create_response: true,
      interrupt_response: false, // 반이중: 면접관이 말하는 동안 클라이언트가 마이크를 닫는다
    };
  }
  return {
    type: "semantic_vad",
    eagerness: snapshot.eagerness,
    create_response: true,
    interrupt_response: false, // 반이중: 면접관이 말하는 동안 클라이언트가 마이크를 닫는다
  };
}

/** OpenAI Realtime 세션 설정 (session.type = "realtime") */
export function buildRealtimeSession(interview: Interview) {
  const questionCount = interview.questionIds.length;
  return {
    type: "realtime",
    model: interview.model,
    instructions: interview.instructions,
    output_modalities: ["audio"],
    // 질문 진행 파악용 도구. 프로토콜 문구는 createInterview가 instructions에 붙인다.
    ...(questionCount > 0 ? { tools: [startQuestionTool(questionCount)], tool_choice: "auto" } : {}),
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
          language: "ko",
          prompt: TRANSCRIPTION_PROMPT,
        },
        turn_detection: turnDetection(interview.turnDetection),
      },
      output: { voice: interview.voice },
    },
  };
}

export { OPENAI_BASE_URL };

/** 서버에서 Realtime 통화를 끊는다 (WebRTC·SIP 공통). 실패해도 예외를 던지지 않는다. */
export async function hangupCall(callId: string) {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) return false;
  try {
    const response = await fetch(`${OPENAI_BASE_URL()}/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // 이미 끝난 통화는 404 등으로 응답할 수 있다.
    if (!response.ok && response.status !== 404) {
      console.error("Realtime hangup failed", callId, response.status, await response.text());
    }
    return response.ok;
  } catch (error) {
    console.error("Realtime hangup error", callId, error);
    return false;
  }
}
