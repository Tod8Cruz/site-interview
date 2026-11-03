import { NextResponse } from "next/server";
import { checkApiKey, handleRouteError } from "@/server/http";
import { listCategories } from "@/server/questions";

export async function GET(request: Request) {
  const { userId, denied } = await checkApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listCategories(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
