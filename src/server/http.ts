import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { findValidApiToken, touchApiToken } from "./api-tokens";
import { currentUser } from "./auth";
import { ConflictError, NotFoundError } from "./interviews";
import { OpenAIError } from "./openai";
import { QuestionGroupError } from "./question-groups";

export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export type ApiAuth = { userId: string; denied?: undefined } | { userId?: undefined; denied: NextResponse };

/**
 * 질문 API 인증 (A-2). 설정 화면에서 발급한 토큰으로 인증하고, 토큰을 발급한 사용자의 질문만 다룬다.
 * 실패하면 denied에 돌려줄 응답이 들어 있다.
 */
export async function checkApiKey(request: Request): Promise<ApiAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { denied: jsonError(401, "unauthorized", "Authorization: Bearer <API 토큰> 헤더가 필요합니다.") };
  }

  const found = await findValidApiToken(token).catch((error) => {
    console.error(error);
    return undefined;
  });
  if (found === undefined) return { denied: jsonError(500, "internal_error", "서버 오류가 발생했습니다.") };
  if (!found) return { denied: jsonError(401, "unauthorized", "API 토큰이 올바르지 않거나 만료되었습니다.") };
  after(() => touchApiToken(found.id).catch(console.error));
  return { userId: found.userId };
}

/** 내부 API(브라우저가 쿠키로 호출) 인증. 로그인한 사용자가 없으면 denied에 401 응답이 들어 있다. */
export async function checkSession(): Promise<ApiAuth> {
  const user = await currentUser();
  if (!user) return { denied: jsonError(401, "unauthorized", "로그인이 필요합니다.") };
  return { userId: user.id };
}

/** Cron 라우트 인증. CRON_SECRET이 없으면 호출을 막는다. */
export function checkCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return jsonError(503, "cron_not_configured", "CRON_SECRET이 설정되지 않았습니다.");
  const header = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(header), digest(`Bearer ${expected}`))) {
    return jsonError(401, "unauthorized", "인증에 실패했습니다.");
  }
  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("요청 본문이 올바른 JSON이 아닙니다.");
  }
}

export class BadRequestError extends Error {}

export const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** 서비스 계층 예외를 API 오류 형식(A-5)으로 바꾼다. */
export function handleRouteError(error: unknown) {
  if (error instanceof z.ZodError) return jsonError(400, "validation_error", formatZodError(error));
  if (error instanceof BadRequestError || error instanceof QuestionGroupError) {
    return jsonError(400, "bad_request", error.message);
  }
  if (error instanceof NotFoundError) return jsonError(404, "not_found", error.message);
  if (error instanceof OpenAIError) return jsonError(502, "openai_error", error.message);
  if (error instanceof ConflictError) {
    return jsonError(409, "conflict", error.message, { interviewId: error.interviewId });
  }
  console.error(error);
  return jsonError(500, "internal_error", "서버 오류가 발생했습니다.");
}
