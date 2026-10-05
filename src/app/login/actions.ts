"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  constantTimeEqual,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from "@/lib/session";

export type LoginState = { error?: string };

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/interviews";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "서버에 APP_PASSWORD가 설정되지 않았습니다." };
  if (!constantTimeEqual(password, expected)) return { error: "비밀번호가 맞지 않습니다." };

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
