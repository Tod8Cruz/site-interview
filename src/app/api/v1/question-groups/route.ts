import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, readJson } from "@/server/http";
import { createQuestionGroup, listQuestionGroups } from "@/server/question-groups";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listQuestionGroups(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const group = await createQuestionGroup(userId, (await readJson(request)) as never);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
