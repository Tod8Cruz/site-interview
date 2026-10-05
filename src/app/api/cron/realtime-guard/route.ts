import { NextResponse } from "next/server";
import { checkCronSecret, handleRouteError } from "@/server/http";
import { abortStaleInterviews, hangupOverdueCalls } from "@/server/interviews";

/**
 * 서버 쪽 비용 상한(PRD 5절·M6): 최대 시간 + 2분이 지난 통화를 끊고, 방치된 면접을 정리한다.
 * Vercel Cron은 `Authorization: Bearer $CRON_SECRET`을 붙여 호출한다.
 */
export async function GET(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  try {
    const hungUp = await hangupOverdueCalls();
    await abortStaleInterviews();
    return NextResponse.json({ ok: true, hungUp });
  } catch (error) {
    return handleRouteError(error);
  }
}
