import { NextResponse } from "next/server";
import { handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { getInterview, getInterviewRecordings, saveRecording } from "@/server/interviews";

const notFound = () => jsonError(404, "not_found", "면접을 찾을 수 없습니다.");

/** 녹음 구간 목록 (복구 컴포넌트가 이미 올라간 구간을 가려낼 때 쓴다) */
export async function GET(_request: Request, ctx: RouteContext<"/api/interviews/[id]/recordings">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const interview = await getInterview(id);
  if (!interview) return notFound();
  return NextResponse.json(await getInterviewRecordings(id));
}

/** 업로드가 끝난 녹음 구간을 등록한다. 같은 구간을 다시 올리면 덮어쓴다. */
export async function POST(request: Request, ctx: RouteContext<"/api/interviews/[id]/recordings">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const interview = await getInterview(id);
  if (!interview) return notFound();
  try {
    const recording = await saveRecording(id, await readJson(request));
    return NextResponse.json(recording, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
