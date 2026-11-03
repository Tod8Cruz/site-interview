"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, startSession } from "@/server/auth";
import { authenticateUser, createUser, SignupError } from "@/server/users";

export type LoginState = { error?: string; email?: string };

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/interviews";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const user = await authenticateUser(email, String(formData.get("password") ?? ""));
  if (!user) return { error: "이메일 또는 비밀번호가 맞지 않습니다.", email };
  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signup(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("passwordConfirm") ?? "")) {
    return { error: "비밀번호 확인이 일치하지 않습니다.", email };
  }
  let userId: string;
  try {
    userId = (await createUser({ email, password })).id;
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "입력값이 올바르지 않습니다.", email };
    if (error instanceof SignupError) return { error: error.message, email };
    throw error;
  }
  await startSession(userId);
  // 키가 없으면 면접을 시작할 수 없으니 설정 화면의 OpenAI 키 칸부터 보여 준다.
  redirect("/settings#openai");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
