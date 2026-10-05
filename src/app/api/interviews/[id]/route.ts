import { NextResponse } from "next/server";
import { handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { deleteInterview, getInterview, patchInterview } from "@/server/interviews";

const notFound = () => jsonError(404, "not_found", "면접을 찾을 수 없습니다.");

/** L-10 녹음 복구가 업로드 여부를 판단할 때 쓰는 최소 상태 */
export async function GET(_request: Request, ctx: RouteContext<"/api/interviews/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const interview = await getInterview(id);
  if (!interview) return notFound();
  return NextResponse.json({ id, status: interview.status, audioStatus: interview.audioStatus });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/interviews/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const interview = await patchInterview(id, await readJson(request));
    return interview ? NextResponse.json(interview) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/interviews/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deleteInterview(id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
