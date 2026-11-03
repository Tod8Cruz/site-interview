import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, readJson } from "@/server/http";
import { createPrompt, listPrompts } from "@/server/prompts";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listPrompts(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const prompt = await createPrompt(userId, (await readJson(request)) as never);
    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
