import { upload } from "@vercel/blob/client";
import { deleteRecording, loadRecording } from "./chunk-store";
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

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * L-2·L-3: 녹음을 탐색 가능하게 보정한 뒤 Vercel Blob에 올리고 면접 기록에 연결한다.
 * 성공하면 IndexedDB 조각을 지운다. 실패하면 조각을 남겨 재시도·내려받기를 할 수 있게 한다(L-4).
 */
export async function uploadRecording(interviewId: string, recording?: Blob): Promise<UploadResult> {
  try {
    const source = recording ?? (await loadRecording(interviewId))?.blob;
    if (!source?.size) return { ok: false, error: "저장된 녹음이 없습니다." };
    const file = await makeSeekable(source).catch((error) => {
      console.error("탐색 보정 실패, 원본을 올립니다", error);
      return source;
    });
    const type = file.type.split(";")[0] || "audio/webm";
    const blob = await upload(`interviews/${interviewId}.${extensionFor(type)}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: type,
      multipart: file.size > MULTIPART_THRESHOLD,
    });
    await patchInterview(interviewId, {
      audioStatus: "uploaded",
      audioUrl: blob.url,
      audioPathname: blob.pathname,
      audioBytes: file.size,
    });
    await deleteRecording(interviewId);
    return { ok: true, url: blob.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await patchInterview(interviewId, { audioStatus: "pending" }).catch(() => {});
    return { ok: false, error: message };
  }
}

/** L-4: 업로드가 안 될 때 브라우저에 남은 녹음을 파일로 내려받는다. */
export async function downloadLocalRecording(interviewId: string) {
  const stored = await loadRecording(interviewId);
  if (!stored) return false;
  const file = await makeSeekable(stored.blob).catch(() => stored.blob);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview-${interviewId}.${extensionFor(file.type)}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
