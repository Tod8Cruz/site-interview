import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, readJson } from "@/server/http";
import { createQuestion, listQuestions } from "@/server/questions";
import { questionListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = questionListQuerySchema.parse(params);
    const { items, total } = await listQuestions(userId, query);
    return NextResponse.json({ items, total, limit: query.limit, offset: query.offset });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const question = await createQuestion(userId, (await readJson(request)) as never);
    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
