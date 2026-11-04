import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { deleteQuestionGroup, getQuestionGroup, updateQuestionGroup } from "@/server/question-groups";

const notFound = () => jsonError(404, "not_found", "질문 그룹을 찾을 수 없습니다.");

export async function GET(request: Request, ctx: RouteContext<"/api/v1/question-groups/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const group = await getQuestionGroup(userId, id);
    return group ? NextResponse.json(group) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/question-groups/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const group = await updateQuestionGroup(userId, id, (await readJson(request)) as never);
    return group ? NextResponse.json(group) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/question-groups/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deleteQuestionGroup(userId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
