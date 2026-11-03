// 일시정지·재개 시간 계산. 서버·클라이언트 공용 순수 함수.

type TimedTurn = { startMs: number; endMs: number | null };
type QuestionTurn = { questionId: string | null };

/**
 * 비정상 종료(탭 닫힘 등)로 일시정지 기록이 없는 면접의 누적 진행 시간을 추정한다.
 * 턴의 시각은 누적 시계라, 마지막 턴의 끝이 곧 진행 시간이다. 턴이 없으면 이전 누적값을 쓴다.
 */
export function estimateActiveMs(durationMs: number | null | undefined, turns: TimedTurn[]) {
  let max = durationMs ?? 0;
  for (const turn of turns) max = Math.max(max, turn.endMs ?? turn.startMs);
  return max;
}

/**
 * 재개 시 이어갈 질문 번호(0부터). 일시정지 때 저장한 값이 있으면 그것을, 없으면 턴에 찍힌 질문으로 역산한다.
 */
export function resumeQuestionIndex(
  saved: number | null | undefined,
  turns: QuestionTurn[],
  questionIds: string[],
): number | null {
  if (saved != null) return saved;
  let index: number | null = null;
  for (const turn of turns) {
    if (!turn.questionId) continue;
    const i = questionIds.indexOf(turn.questionId);
    if (i >= 0 && (index === null || i > index)) index = i;
  }
  return index;
}
