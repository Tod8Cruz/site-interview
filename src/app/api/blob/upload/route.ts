import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { checkSession, handleRouteError, jsonError } from "@/server/http";
import { getInterview } from "@/server/interviews";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

// 업로드 완료 후 DB 반영은 클라이언트가 PATCH로 한다(로컬에서도 동작하도록).
// 경로는 interviews/{면접 id}-{구간 시작 ms}.{확장자}이고, 자기 면접에만 올릴 수 있다.
const PATHNAME = /^interviews\/([0-9a-f-]{36})-\d+\.[a-z0-9]+$/;

export async function POST(request: Request) {
  const { userId, denied } = await checkSession();
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonError(503, "blob_not_configured", "BLOB_READ_WRITE_TOKEN이 설정되지 않았습니다.");
  }
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const interviewId = PATHNAME.exec(pathname)?.[1];
        if (!interviewId || !(await getInterview(userId, interviewId))) throw new Error("허용되지 않은 경로입니다.");
        return {
          allowedContentTypes: ["audio/*"],
          maximumSizeInBytes: MAX_AUDIO_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) return jsonError(400, "upload_error", error.message);
    return handleRouteError(error);
  }
}
