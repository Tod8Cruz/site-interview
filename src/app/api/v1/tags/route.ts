import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError } from "@/server/http";
import { listTags } from "@/server/questions";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listTags(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
