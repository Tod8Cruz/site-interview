export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "-";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export const STATUS_LABEL = { in_progress: "진행중", paused: "일시정지", completed: "완료", aborted: "중단" } as const;
export const AUDIO_LABEL = {
  uploaded: "녹음 있음",
  pending: "업로드 대기",
  failed: "업로드 실패",
  none: "녹음 없음",
} as const;
