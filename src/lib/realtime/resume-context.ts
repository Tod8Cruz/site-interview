// 일시정지된 면접을 재개할 때, 저장된 대화를 Realtime 대화 항목으로 되살리는 순수 함수.
// 데이터 채널이 열린 직후 response.create 전에 순서대로 보낸다.

export type ResumeTurn = { role: "interviewer" | "candidate"; text: string; interrupted: boolean };

export type ResumeOptions = {
  /** 일시정지 시점에 진행 중이던 질문 번호(0부터). 인사 단계면 null */
  questionIndex: number | null;
  questionCount: number;
  /** 멈춰 있던 시간 */
  pausedForMs: number;
  /** 주입할 대화의 최대 글자 수. 넘치면 오래된 턴부터 뺀다. */
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 24_000;

function message(role: "user" | "assistant" | "system", text: string) {
  const type = role === "assistant" ? "output_text" : "input_text";
  return { type: "conversation.item.create", item: { type: "message", role, content: [{ type, text }] } };
}

/** 재개 직후 면접관에게 주는 안내문 */
export function resumeNotice(turns: ResumeTurn[], opts: ResumeOptions) {
  const minutes = Math.max(1, Math.round(opts.pausedForMs / 60_000));
  const last = turns.at(-1);
  const lastInterviewer = [...turns].reverse().find((t) => t.role === "interviewer");
  const lines = [
    `[재개 안내] 면접이 약 ${minutes}분 동안 멈췄다가 지금 재개되었습니다. 위 대화가 지금까지의 기록입니다.`,
    opts.questionCount > 0
      ? opts.questionIndex === null
        ? "아직 질문 목록의 질문은 시작하지 않았습니다(인사·자기소개 단계)."
        : `질문 목록 ${opts.questionIndex + 1}번까지 시작했습니다. 1번부터 다시 시작하지 마세요.`
      : "",
    '인사와 자기소개 요청을 반복하지 말고, "면접을 이어서 진행하겠습니다"라고 짧게 말한 뒤 이어가세요.',
    lastInterviewer?.interrupted ? "마지막 면접관 발언이 중간에 끊겼으니 그 질문을 다시 간단히 말해 주세요." : "",
    last?.role === "candidate" ? "지원자의 마지막 답변이 도중에 멈춘 것 같으면 이어서 답하게 하고, 끝났으면 다음으로 넘어가세요." : "",
  ];
  return lines.filter(Boolean).join(" ");
}

/** 저장된 턴 → Realtime 클라이언트 이벤트 목록 (대화 항목들 + 재개 안내) */
export function buildResumeItems(turns: ResumeTurn[], opts: ResumeOptions): Record<string, unknown>[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const kept = turns.filter((t) => t.text.trim());
  let total = kept.reduce((sum, t) => sum + t.text.length, 0);
  let dropped = 0;
  while (kept.length > 1 && total > maxChars) {
    total -= kept.shift()!.text.length;
    dropped++;
  }
  const items: Record<string, unknown>[] = [];
  if (dropped) items.push(message("system", `(앞부분 대화 ${dropped}개는 생략되었습니다.)`));
  for (const turn of kept) items.push(message(turn.role === "candidate" ? "user" : "assistant", turn.text));
  items.push(message("system", resumeNotice(turns, opts)));
  return items;
}
