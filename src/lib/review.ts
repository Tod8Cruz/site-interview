// 다시 보기 화면의 복기 계산 (L-13, L-14). 서버·클라이언트 공용 순수 함수.

export type ReviewTurn = {
  id: string;
  role: "interviewer" | "candidate";
  text: string;
  startMs: number;
  endMs: number | null;
  interrupted: boolean;
  note: string | null;
  noteQuestionId: string | null;
  /** 면접 중 start_question 도구로 기록된 질문 (없으면 null) */
  questionId: string | null;
};

export type ReviewQuestion = { id: string; question: string };

function bigrams(text: string) {
  const normalized = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const grams = new Map<string, number>();
  for (let i = 0; i < normalized.length - 1; i++) {
    const gram = normalized.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** 문자 bigram Dice 계수 (0~1). 한국어 질문 문장 비교용. */
export function similarity(a: string, b: string) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [gram, count] of ga) {
    overlap += Math.min(count, gb.get(gram) ?? 0);
    total += count;
  }
  for (const count of gb.values()) total += count;
  return total ? (2 * overlap) / total : 0;
}

const MIN_SIMILARITY = 0.15;

/**
 * L-14 기본값: 면접 중 기록된 질문이 있으면 그것, 없으면 이 턴 직전(이 턴 포함) 면접관 발화와 가장 비슷한 예상 질문.
 */
export function suggestQuestion(turns: ReviewTurn[], index: number, questions: ReviewQuestion[]) {
  if (!questions.length) return null;
  const known = new Set(questions.map((q) => q.id));
  let asked: ReviewTurn | undefined;
  for (let i = index; i >= 0; i--) {
    if (turns[i].role === "interviewer") {
      asked = turns[i];
      break;
    }
  }
  const recorded = turns[index].questionId ?? asked?.questionId ?? null;
  if (recorded && known.has(recorded)) return recorded;
  if (!asked) return null;
  let best: { id: string; score: number } | null = null;
  for (const q of questions) {
    const score = similarity(asked.text, q.question);
    if (!best || score > best.score) best = { id: q.id, score };
  }
  return best && best.score >= MIN_SIMILARITY ? best.id : null;
}

export type AnswerMetrics = {
  /** 답변 길이 (end - start) */
  durationMs: number | null;
  /** 첫마디까지 걸린 시간: 직전 면접관 턴 끝 → 이 턴 시작 */
  firstWordMs: number | null;
};

/** L-13: 지원자 턴마다 답변 지표를 계산한다. 면접관 턴은 null. */
export function answerMetrics(turns: ReviewTurn[]): (AnswerMetrics | null)[] {
  let lastInterviewerEnd: number | null = null;
  return turns.map((t) => {
    if (t.role === "interviewer") {
      lastInterviewerEnd = t.endMs;
      return null;
    }
    const firstWordMs =
      lastInterviewerEnd !== null && t.startMs >= lastInterviewerEnd ? t.startMs - lastInterviewerEnd : null;
    lastInterviewerEnd = null;
    return { durationMs: t.endMs !== null ? Math.max(0, t.endMs - t.startMs) : null, firstWordMs };
  });
}

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** L-7: 대화 기록(메모 포함)을 마크다운으로 */
export function transcriptMarkdown(title: string, turns: ReviewTurn[], questions: ReviewQuestion[]) {
  const qById = new Map(questions.map((q) => [q.id, q.question]));
  const metrics = answerMetrics(turns);
  const lines = [`# ${title}`, ""];
  turns.forEach((t, i) => {
    const who = t.role === "interviewer" ? "면접관" : "나";
    const m = metrics[i];
    const extra = [
      t.interrupted ? "끊김" : null,
      m?.durationMs != null ? `답변 ${mmss(m.durationMs)}` : null,
      m?.firstWordMs != null ? `첫마디 ${(m.firstWordMs / 1000).toFixed(1)}초` : null,
    ].filter(Boolean);
    lines.push(`**${who}** \`${mmss(t.startMs)}\`${extra.length ? ` (${extra.join(", ")})` : ""}`, "", t.text, "");
    if (t.note) {
      const linked = t.noteQuestionId ? qById.get(t.noteQuestionId) : null;
      lines.push(`> 📝 ${t.note.replace(/\n/g, "\n> ")}${linked ? `\n> — 질문: ${linked}` : ""}`, "");
    }
  });
  return lines.join("\n");
}
