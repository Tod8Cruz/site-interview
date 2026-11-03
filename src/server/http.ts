import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { findValidApiToken, touchApiToken } from "./api-tokens";
import { ConflictError, NotFoundError } from "./interviews";
import { OpenAIError } from "./openai";

export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * 질문 API 인증 (A-2). 실패하면 응답을, 성공하면 null을 돌려준다.
 * 설정 화면에서 발급한 토큰과 환경변수 QUESTIONS_API_KEY(선택) 둘 다 받는다.
 */
export async function checkApiKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return jsonError(401, "unauthorized", "Authorization: Bearer <API 토큰> 헤더가 필요합니다.");
  }
  const envKey = process.env.QUESTIONS_API_KEY;
  if (envKey && timingSafeEqual(digest(token), digest(envKey))) return null;

  const found = await findValidApiToken(token).catch((error) => {
    console.error(error);
    return undefined;
  });
  if (found === undefined) return jsonError(500, "internal_error", "서버 오류가 발생했습니다.");
  if (!found) return jsonError(401, "unauthorized", "API 토큰이 올바르지 않거나 만료되었습니다.");
  after(() => touchApiToken(found.id).catch(console.error));
  return null;
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
  if (error instanceof BadRequestError) return jsonError(400, "bad_request", error.message);
  if (error instanceof NotFoundError) return jsonError(404, "not_found", error.message);
  if (error instanceof OpenAIError) return jsonError(502, "openai_error", error.message);
  if (error instanceof ConflictError) {
    return jsonError(409, "conflict", error.message, { interviewId: error.interviewId });
  }
  console.error(error);
  return jsonError(500, "internal_error", "서버 오류가 발생했습니다.");
}
