import { NextResponse } from "next/server";
import { checkSession, handleRouteError, isUuid, jsonError, readJson } from "@/server/http";
import { updateTurnNote } from "@/server/interviews";

/** L-12·L-14: 턴 메모와 연결 질문 수정 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/interviews/[id]/turns/[turnId]">) {
  const { userId, denied } = await checkSession();
  if (denied) return denied;
  const { id, turnId } = await ctx.params;
  const notFound = () => jsonError(404, "not_found", "턴을 찾을 수 없습니다.");
  if (!isUuid(id) || !isUuid(turnId)) return notFound();
  try {
    const turn = await updateTurnNote(userId, id, turnId, await readJson(request));
    return turn ? NextResponse.json(turn) : notFound();
  } catch (error) {
    return handleRouteError(error);
  }
}
