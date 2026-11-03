import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { deleteQuestion, getQuestion, updateQuestion } from "@/server/questions";

const notFound = () => jsonError(404, "not_found", "질문을 찾을 수 없습니다.");

export async function GET(request: Request, ctx: RouteContext<"/api/v1/questions/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const question = await getQuestion(userId, id);
    return question ? NextResponse.json(question) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/questions/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const question = await updateQuestion(userId, id, (await readJson(request)) as never);
    return question ? NextResponse.json(question) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/questions/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deleteQuestion(userId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
