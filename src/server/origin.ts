import "server-only";
import { headers } from "next/headers";

/** 현재 요청의 origin (https://example.com). 프록시 뒤(Vercel)에서도 맞게 나온다. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
