import { NextResponse } from "next/server";
import { handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { getInterview, saveTurn } from "@/server/interviews";

export async function POST(request: Request, ctx: RouteContext<"/api/interviews/[id]/turns">) {
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getInterview(id))) {
    return jsonError(404, "not_found", "면접을 찾을 수 없습니다.");
  }
  try {
    const turn = await saveTurn(id, (await readJson(request)) as never);
    return NextResponse.json(turn, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
