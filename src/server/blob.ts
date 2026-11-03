import "server-only";
import { del, issueSignedToken, presignUrl } from "@vercel/blob";

export { isBlobUrlFor, isPublicBlobUrl, isRecordingPathname } from "@/lib/blob-paths";

/** 재생 URL 유효 시간. 긴 녹음을 듣는 중에 탐색해도 끊기지 않을 만큼 둔다. */
const PLAYBACK_TTL_MS = 2 * 60 * 60 * 1000;

/** 비공개 녹음 파일을 브라우저가 직접 받을 수 있는 짧은 수명의 서명 URL. 호출자가 면접 주인을 확인한다. */
export async function signedRecordingUrl(pathname: string) {
  const validUntil = Date.now() + PLAYBACK_TTL_MS;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
  return presignedUrl;
}

export async function deleteBlob(url: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(url).catch((error) => console.error("blob delete failed", error));
}
