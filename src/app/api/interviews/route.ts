import { NextResponse } from "next/server";
import { handleRouteError, readJson } from "@/server/http";
import { createInterview } from "@/server/interviews";

export async function POST(request: Request) {
  try {
    const interview = await createInterview((await readJson(request)) as never);
    return NextResponse.json({ id: interview.id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
