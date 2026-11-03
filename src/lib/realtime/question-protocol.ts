// 질문 진행 프로토콜: 면접관 모델이 새 질문을 꺼내기 직전에 start_question 도구를 호출하게 해서
// 앱이 "지금 몇 번 질문인지"를 알게 한다. 서버(세션 설정)와 클라이언트(이벤트 처리)가 함께 쓴다.

import type { ServerEvent } from "./turn-tracker";

export const START_QUESTION_TOOL = "start_question";

export type ProtocolQuestion = { id: string; question: string };

/** Realtime 세션 설정의 tools 항목 */
export function startQuestionTool(count: number) {
  return {
    type: "function",
    name: START_QUESTION_TOOL,
    description:
      "질문 목록의 질문을 새로 시작할 때, 그 질문을 말하기 직전에 호출한다. 꼬리질문·인사·자기소개 요청·마무리에는 호출하지 않는다. 결과의 question은 뜻을 유지하되 면접관 말투의 자연스러운 존댓말 문장으로 바꿔 물어본다.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "integer", minimum: 1, maximum: count, description: "질문 목록 번호 (1부터, 순서대로)" },
      },
      required: ["index"],
      additionalProperties: false,
    },
  };
}

/** 면접관 프롬프트 뒤에 붙이는 고정 문구. 사용자가 고친 프롬프트와 충돌해도 이 규칙이 우선하도록 명시한다. */
export function questionProtocol(count: number) {
  if (count <= 0) return "";
  return `

[진행 프로토콜 — 위의 지시와 다르더라도 이 규칙이 우선합니다]
- 질문 목록의 질문 ${count}개는 반드시 1번부터 번호 순서대로 물어보세요. 순서를 바꾸거나 건너뛰지 마세요.
- 목록의 질문을 새로 시작할 때마다, 그 질문을 말하기 직전에 ${START_QUESTION_TOOL} 도구를 호출하세요. index는 질문 목록의 번호(1부터)입니다.
- 꼬리질문, 인사, 자기소개 요청, 마무리 발언에는 ${START_QUESTION_TOOL}을 호출하지 마세요.
- 도구 결과의 question은 핵심 내용과 뜻을 유지하되, 목록의 문구를 그대로 읽지 말고 앞뒤 대화와 같은 말투의 자연스러운 문장으로 바꿔 물어보세요.
  예: "교사가 되려는 이유는?" → "교사가 되려는 이유는 무엇인가요?", "갈등 해결 경험" → "갈등을 해결해 본 경험이 있다면 말씀해 주시겠어요?"
- 도구 호출에 대해 지원자에게 언급하지 마세요.
- 도구가 오류를 돌려주면 그 안의 expected 번호로 다시 호출하세요.`;
}

/**
 * 재개한 통화의 세션 지시문 뒤에 붙이는 문구. 대화 기록은 클라이언트가 대화 항목으로 넣고(resume-context),
 * 여기서는 "처음부터 다시 하지 말라"는 규칙을 지시문 수준에서 못 박는다.
 */
export function resumeProtocol(currentIndex: number | null, count: number) {
  const progress =
    count <= 0
      ? ""
      : currentIndex === null
        ? `\n- 질문 목록의 질문은 아직 시작하지 않았으니 1번부터 ${START_QUESTION_TOOL}을 호출해 진행하세요.`
        : `\n- 질문 목록 ${currentIndex + 1}번까지 시작했습니다. 1번부터 다시 시작하지 마세요. ${currentIndex + 1}번 답변이 끝나지 않았으면 이어서 듣고, 끝났으면 ${Math.min(count, currentIndex + 2)}번부터 ${START_QUESTION_TOOL}을 호출해 진행하세요.`;
  return `

[재개 프로토콜 — 위의 지시보다 우선합니다]
- 이 면접은 일시정지 후 재개된 것입니다. 지금까지의 대화는 대화 기록에 들어 있습니다.
- 인사와 자기소개 요청을 반복하지 말고, 이어서 진행하겠다고 짧게 말한 뒤 계속하세요.
- "질문을 준비하겠습니다", "잠시만요"처럼 기다리게 하는 말은 하지 말고 바로 질문하세요.${progress}`;
}

export type StartQuestionReply = { callId: string; output: string };

/**
 * start_question에 답한 뒤 새 응답을 요청해야 하는지. 도구 호출 뒤에 음성(message)이 이어졌으면 질문은 이미 했으므로
 * 다음 응답은 VAD가 만든다. 음성이 호출 앞에만 있으면("잠시만요" 같은 예고) 질문을 아직 안 했으니 요청해야 멈추지 않는다.
 */
export function needsFollowUpResponse(output: { type?: string; name?: string }[]) {
  const lastCall = output.findLastIndex((item) => item.type === "function_call" && item.name === START_QUESTION_TOOL);
  if (lastCall < 0) return false;
  return !output.slice(lastCall + 1).some((item) => item.type === "message");
}

type FunctionCallItem = { type?: string; name?: string; call_id?: string; arguments?: string };

/**
 * response.done 안의 start_question 호출을 검증하고 진행 상태를 올린다.
 * - 같은 번호는 멱등, 뒤로 가는 호출은 거부(사이드바가 되돌아가지 않게), 앞으로 건너뛰는 건 허용(시간 부족 시 정당함).
 * - 돌려주는 output은 그대로 function_call_output으로 보낸다. 질문 원문을 돌려줘 내용이 어긋나지 않게 한다(말투는 프로토콜에서 바꾸게 함).
 */
export class QuestionTracker {
  /** 0부터 시작. null이면 아직 인사·자기소개 단계 */
  current: number | null;
  private seen = new Set<string>();

  /** initial: 재개할 때 일시정지 시점의 질문 번호(0부터)를 넣는다. */
  constructor(
    private readonly questions: ProtocolQuestion[],
    initial: number | null = null,
  ) {
    this.current = initial;
  }

  get currentId() {
    return this.current === null ? null : (this.questions[this.current]?.id ?? null);
  }

  get count() {
    return this.questions.length;
  }

  handle(event: ServerEvent): StartQuestionReply[] {
    if (event.type !== "response.done") return [];
    const output = (event.response as { output?: FunctionCallItem[] } | undefined)?.output;
    if (!Array.isArray(output)) return [];
    const replies: StartQuestionReply[] = [];
    for (const item of output) {
      if (item?.type !== "function_call" || item.name !== START_QUESTION_TOOL || !item.call_id) continue;
      if (this.seen.has(item.call_id)) continue;
      this.seen.add(item.call_id);
      replies.push({ callId: item.call_id, output: JSON.stringify(this.apply(item.arguments)) });
    }
    return replies;
  }

  private apply(rawArguments: string | undefined) {
    const count = this.questions.length;
    const expected = (this.current ?? -1) + 2;
    let index: unknown;
    try {
      index = (JSON.parse(rawArguments || "{}") as { index?: unknown }).index;
    } catch {
      return { ok: false, error: "arguments must be JSON", expected };
    }
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > count) {
      return { ok: false, error: `index must be an integer between 1 and ${count}`, expected };
    }
    const next = index - 1;
    if (this.current !== null && next < this.current) {
      return { ok: false, error: "questions must be asked in order; cannot go back", expected };
    }
    this.current = next;
    return { ok: true, index, question: this.questions[next].question };
  }
}
