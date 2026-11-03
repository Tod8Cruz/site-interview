import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { apiTokenCreateSchema, type ApiTokenCreateInput } from "@/lib/validation";

const TOKEN_PREFIX = "mi_";
const DAY_MS = 24 * 60 * 60 * 1000;
/** 마지막 사용 시각은 이 간격보다 자주 쓰지 않는다 (요청마다 UPDATE 방지). */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function listApiTokens(userId: string) {
  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
  const now = Date.now();
  return rows.map((r) => ({ ...r, expired: r.expiresAt !== null && r.expiresAt.getTime() <= now }));
}

/** 새 토큰을 만든다. 원문(token)은 이 반환값에서만 볼 수 있다. */
export async function createApiToken(userId: string, input: ApiTokenCreateInput) {
  const { name, expiresInDays } = apiTokenCreateSchema.parse(input);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 8),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * DAY_MS) : null,
    })
    .returning({ id: apiTokens.id, name: apiTokens.name, expiresAt: apiTokens.expiresAt });
  return { ...row, token };
}

export async function deleteApiToken(userId: string, id: string) {
  const [row] = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.id, id)))
    .returning({ id: apiTokens.id });
  return Boolean(row);
}

/** 유효한(만료되지 않은) 토큰이면 토큰 id와 주인을 돌려준다. 주인이 없는(계정 기능 이전) 토큰은 쓸 수 없다. */
export async function findValidApiToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, hashToken(token)),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
      ),
    );
  return row?.userId ? { id: row.id, userId: row.userId } : null;
}

export async function touchApiToken(id: string) {
  const now = new Date();
  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(apiTokens.id, id),
        or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_RESOLUTION_MS))),
      ),
    );
}
