import { NextResponse } from "next/server";
import { handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { getInterview, saveTurn } from "@/server/interviews";

export async function POST(request: Request, ctx: RouteContext<"/api/interviews/[id]/turns">) {
  const { id } = await ctx.params;
  const interview = isUuid(id) ? await getInterview(id) : null;
  if (!interview) return jsonError(404, "not_found", "면접을 찾을 수 없습니다.");
  try {
    const body = (await readJson(request)) as { questionId?: unknown };
    // 이 면접의 질문이 아니면 FK 오류 대신 조용히 비운다.
    if (typeof body.questionId === "string" && !interview.questionIds.includes(body.questionId)) body.questionId = null;
    const turn = await saveTurn(id, body as never);
    return NextResponse.json(turn, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
