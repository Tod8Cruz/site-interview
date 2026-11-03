import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { deletePrompt, getPrompt, updatePrompt } from "@/server/prompts";

const notFound = () => jsonError(404, "not_found", "프롬프트를 찾을 수 없습니다.");

export async function GET(request: Request, ctx: RouteContext<"/api/v1/prompts/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const prompt = await getPrompt(userId, id);
    return prompt ? NextResponse.json(prompt) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/prompts/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const prompt = await updatePrompt(userId, id, (await readJson(request)) as never);
    return prompt ? NextResponse.json(prompt) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/prompts/[id]">) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deletePrompt(userId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
