import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { prompts } from "@/db/schema";
import { SEED_PROMPTS } from "@/lib/prompt-template";
import { promptSchema, type PromptInput } from "@/lib/validation";

const mine = (userId: string) => eq(prompts.userId, userId);
const owned = (userId: string, id: string) => and(mine(userId), eq(prompts.id, id));

/** P-6: 프롬프트가 하나도 없으면 시드 2개를 넣는다. */
export async function ensureSeedPrompts(userId: string) {
  const [existing] = await db.select({ id: prompts.id }).from(prompts).where(mine(userId)).limit(1);
  if (existing) return;
  await db
    .insert(prompts)
    .values(SEED_PROMPTS.map((p) => ({ ...p, userId })))
    .onConflictDoNothing();
}

export async function listPrompts(userId: string) {
  await ensureSeedPrompts(userId);
  return db.select().from(prompts).where(mine(userId)).orderBy(desc(prompts.isDefault), asc(prompts.createdAt));
}

export async function getPrompt(userId: string, id: string) {
  const [row] = await db.select().from(prompts).where(owned(userId, id));
  return row ?? null;
}

export async function createPrompt(userId: string, input: PromptInput) {
  const data = promptSchema.parse(input);
  const [row] = await db.insert(prompts).values({ ...data, userId }).returning();
  return row;
}

export async function updatePrompt(userId: string, id: string, input: PromptInput) {
  const data = promptSchema.parse(input);
  const [row] = await db.update(prompts).set(data).where(owned(userId, id)).returning();
  return row ?? null;
}

export async function setDefaultPrompt(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: prompts.id }).from(prompts).where(owned(userId, id));
    if (!target) return;
    await tx.update(prompts).set({ isDefault: false }).where(and(mine(userId), ne(prompts.id, id)));
    await tx.update(prompts).set({ isDefault: true }).where(owned(userId, id));
  });
}

/** 기본 프롬프트를 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. */
export async function deletePrompt(userId: string, id: string) {
  const [deleted] = await db.delete(prompts).where(owned(userId, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(mine(userId))
      .orderBy(asc(prompts.createdAt))
      .limit(1);
    if (next) await setDefaultPrompt(userId, next.id);
  }
  return Boolean(deleted);
}
