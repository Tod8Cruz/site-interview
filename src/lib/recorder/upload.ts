import { upload } from "@vercel/blob/client";
import { deleteRecording, listInterviewRecordings, loadRecording, recordingKey } from "./chunk-store";
import { TIMESLICE_MS } from "./mixed-recorder";
import { makeSeekable } from "./seekable";

const MULTIPART_THRESHOLD = 8 * 1024 * 1024;

async function patchInterview(interviewId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/interviews/${interviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`면접 기록 갱신 실패 (${response.status})`);
}

function extensionFor(mimeType: string) {
  return mimeType.includes("mp4") ? "m4a" : "webm";
}

export type UploadResult = { ok: true } | { ok: false; error: string };

export type SegmentSource = { blob: Blob; durationMs: number };

/**
 * L-2·L-3: 녹음 구간을 탐색 가능하게 보정한 뒤 Vercel Blob에 올리고 면접 기록에 구간으로 등록한다.
 * 성공하면 IndexedDB 조각을 지운다. 실패하면 조각을 남겨 재시도·내려받기를 할 수 있게 한다(L-4).
 * source를 주지 않으면 이 브라우저에 남은 조각으로 올린다.
 */
export async function uploadSegment(interviewId: string, startMs: number, source?: SegmentSource): Promise<UploadResult> {
  const key = recordingKey(interviewId, startMs);
  try {
    let segment = source ?? null;
    if (!segment) {
      const stored = await loadRecording(key);
      if (stored) {
        // 비정상 종료로 길이를 못 쟀으면 조각 수로 어림한다.
        segment = { blob: stored.blob, durationMs: stored.meta?.durationMs ?? stored.chunkCount * TIMESLICE_MS };
      }
    }
    if (!segment?.blob.size) return { ok: false, error: "저장된 녹음이 없습니다." };
    const file = await makeSeekable(segment.blob).catch((error) => {
      console.error("탐색 보정 실패, 원본을 올립니다", error);
      return segment!.blob;
    });
    const type = file.type.split(";")[0] || "audio/webm";
    const blob = await upload(`interviews/${interviewId}-${startMs}.${extensionFor(type)}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: type,
      multipart: file.size > MULTIPART_THRESHOLD,
    });
    const response = await fetch(`/api/interviews/${interviewId}/recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startMs,
        durationMs: Math.round(segment.durationMs),
        mimeType: type,
        url: blob.url,
        pathname: blob.pathname,
        bytes: file.size,
      }),
    });
    if (!response.ok) throw new Error(`녹음 구간 등록 실패 (${response.status})`);
    await deleteRecording(key);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await patchInterview(interviewId, { audioStatus: "pending" }).catch(() => {});
    return { ok: false, error: message };
  }
}

/** 이 브라우저에 남아 있는 면접의 모든 구간을 올린다. 하나라도 실패하면 실패로 돌려준다. */
export async function uploadPendingSegments(interviewId: string): Promise<UploadResult> {
  const stored = await listInterviewRecordings(interviewId);
  if (!stored.length) return { ok: false, error: "저장된 녹음이 없습니다." };
  const errors: string[] = [];
  for (const meta of stored) {
    const result = await uploadSegment(interviewId, meta.startMs);
    if (!result.ok) errors.push(result.error);
  }
  return errors.length ? { ok: false, error: errors.join(" / ") } : { ok: true };
}

/** L-4: 업로드가 안 될 때 브라우저에 남은 녹음을 구간별 파일로 내려받는다. */
export async function downloadLocalRecording(interviewId: string) {
  const stored = await listInterviewRecordings(interviewId);
  let count = 0;
  for (const meta of stored) {
    const recording = await loadRecording(meta.key);
    if (!recording) continue;
    const file = await makeSeekable(recording.blob).catch(() => recording.blob);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${interviewId}${stored.length > 1 ? `-${meta.startMs}` : ""}.${extensionFor(file.type)}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    count++;
  }
  return count > 0;
}
