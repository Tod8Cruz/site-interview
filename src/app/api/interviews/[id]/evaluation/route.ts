import { NextResponse } from "next/server";
import { deleteEvaluation, getEvaluation, runEvaluation } from "@/server/evaluations";
import { handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { OPENAI_NOT_CONFIGURED_MESSAGE } from "@/server/openai";
import { getOpenAIApiKey } from "@/server/settings";

/** OpenAI 평가 호출이 수십 초 걸린다 (Vercel 함수 상한). */
export const maxDuration = 120;

const notFound = () => jsonError(404, "not_found", "평가 결과가 없습니다.");

export async function GET(_request: Request, ctx: RouteContext<"/api/interviews/[id]/evaluation">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const evaluation = await getEvaluation(id);
  return evaluation ? NextResponse.json(evaluation) : notFound();
}

/** 면접을 루브릭으로 평가해 저장한다. 본문: { rubricId?: uuid } (비우면 기본 루브릭) */
export async function POST(request: Request, ctx: RouteContext<"/api/interviews/[id]/evaluation">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "not_found", "면접을 찾을 수 없습니다.");
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) return jsonError(503, "openai_not_configured", OPENAI_NOT_CONFIGURED_MESSAGE);
  try {
    const evaluation = await runEvaluation(id, await readJson(request), apiKey);
    return NextResponse.json(evaluation);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/interviews/[id]/evaluation">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  return (await deleteEvaluation(id)) ? new NextResponse(null, { status: 204 }) : notFound();
}
