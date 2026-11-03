import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken, verifySessionToken } from "@/lib/session";
import { getUser } from "./users";

export type SessionUser = { id: string; email: string };

/**
 * 로그인한 사용자. proxy가 쿠키 서명은 이미 확인했지만, 계정이 지워졌을 수 있으니 DB에서 한 번 더 찾는다.
 * 한 요청 안에서는 한 번만 조회한다.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return userId ? getUser(userId) : null;
});

/** 페이지·서버 액션용. 로그인하지 않았으면 로그인 화면으로 보낸다. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
