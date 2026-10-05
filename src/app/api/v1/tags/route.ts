import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError } from "@/server/http";
import { listTags } from "@/server/questions";

export async function GET(request: Request) {
  const denied = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listTags() });
  } catch (error) {
    return handleRouteError(error);
  }
}
