import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { deleteRubric, getRubric, updateRubric } from "@/server/rubrics";

const notFound = () => jsonError(404, "not_found", "평가 기준을 찾을 수 없습니다.");

export async function GET(request: Request, ctx: RouteContext<"/api/v1/rubrics/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const rubric = await getRubric(userId, id);
    return rubric ? NextResponse.json(rubric) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/rubrics/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const rubric = await updateRubric(userId, id, (await readJson(request)) as never);
    return rubric ? NextResponse.json(rubric) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/rubrics/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deleteRubric(userId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
