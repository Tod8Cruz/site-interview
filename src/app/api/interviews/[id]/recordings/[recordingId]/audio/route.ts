import { NextResponse } from "next/server";
import { isPublicBlobUrl, signedRecordingUrl } from "@/server/blob";
import { checkSession, handleRouteError, isUuid, jsonError } from "@/server/http";
import { getInterview, getInterviewRecording } from "@/server/interviews";

const notFound = () => jsonError(404, "not_found", "녹음을 찾을 수 없습니다.");

/**
 * 녹음 재생. 면접 주인에게만 짧은 수명의 서명 URL로 넘겨준다.
 * 파일 바이트는 이 함수를 거치지 않고 Blob CDN에서 바로 받으므로 탐색(Range 요청)도 그대로 된다.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/interviews/[id]/recordings/[recordingId]/audio">) {
  const { userId, denied } = await checkSession();
  if (denied) return denied;
  const { id, recordingId } = await ctx.params;
  if (!isUuid(id) || !isUuid(recordingId)) return notFound();
  if (!(await getInterview(userId, id))) return notFound();
  const recording = await getInterviewRecording(id, recordingId);
  if (!recording) return notFound();
  try {
    // 비공개 저장소로 옮기기 전에 올라간 파일은 원래 URL로 연다.
    const url = isPublicBlobUrl(recording.url) ? recording.url : await signedRecordingUrl(recording.pathname);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
