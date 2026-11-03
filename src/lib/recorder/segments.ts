// 녹음 구간(일시정지로 나뉜 파일들)을 누적 시계 위에 놓고 찾는 순수 함수.

export type Segment = { url: string; startMs: number; durationMs: number };

/** ms가 속한 구간의 인덱스. 구간 시작 전이면 -1. 구간 사이의 빈 틈은 앞 구간에 붙인다. */
export function segmentAt(segments: Segment[], ms: number) {
  let found = -1;
  segments.forEach((segment, i) => {
    if (segment.startMs <= ms) found = i;
  });
  return found;
}

/** 모든 구간을 합친 길이 */
export function totalDurationMs(segments: Segment[]) {
  return segments.reduce((max, s) => Math.max(max, s.startMs + s.durationMs), 0);
}

/** 구간 목록을 재생 순서로 정렬한다 */
export function sortSegments<T extends { startMs: number }>(segments: T[]) {
  return [...segments].sort((a, b) => a.startMs - b.startMs);
}
