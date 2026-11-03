import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, readJson } from "@/server/http";
import { createQuestions } from "@/server/questions";

export async function POST(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const items = await createQuestions(userId, (await readJson(request)) as never);
    return NextResponse.json({ items }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
