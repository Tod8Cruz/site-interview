import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError, readJson } from "@/server/http";
import { createRubric, listRubrics } from "@/server/rubrics";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listRubrics(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    const rubric = await createRubric(userId, (await readJson(request)) as never);
    return NextResponse.json(rubric, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
