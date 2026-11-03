import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// 쿠키 서명만 확인한다(계정이 실제로 있는지는 서버 코드의 currentUser가 본다).
// /login, /signup 은 로그인 전 화면이다.
// /api/v1/* 와 /api/cron/* 는 Bearer 키로 route handler에서 인증한다.
// /api-docs, /llms.txt 는 AI가 읽는 공개 API 설명서다.
export async function proxy(request: NextRequest) {
  const userId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "로그인이 필요합니다." } },
      { status: 401 },
    );
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|signup|api/v1|api/cron|api-docs|llms\\.txt|_next/static|_next/image|favicon.ico).*)"],
};
