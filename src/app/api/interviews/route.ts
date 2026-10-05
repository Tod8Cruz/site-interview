import { NextResponse } from "next/server";
import { handleRouteError, jsonError, readJson } from "@/server/http";
import { createInterview } from "@/server/interviews";
import { OPENAI_NOT_CONFIGURED_MESSAGE } from "@/server/openai";
import { getOpenAIApiKey } from "@/server/settings";

export async function POST(request: Request) {
  if (!(await getOpenAIApiKey())) return jsonError(503, "openai_not_configured", OPENAI_NOT_CONFIGURED_MESSAGE);
  try {
    const interview = await createInterview((await readJson(request)) as never);
    return NextResponse.json({ id: interview.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
