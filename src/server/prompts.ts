import "server-only";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { prompts } from "@/db/schema";
import { SEED_PROMPTS } from "@/lib/prompt-template";
import { promptSchema, type PromptInput } from "@/lib/validation";

/** P-6: 프롬프트가 하나도 없으면 시드 2개를 넣는다. */
export async function ensureSeedPrompts() {
  const [existing] = await db.select({ id: prompts.id }).from(prompts).limit(1);
  if (existing) return;
  await db.insert(prompts).values(SEED_PROMPTS).onConflictDoNothing();
}

export async function listPrompts() {
  await ensureSeedPrompts();
  return db.select().from(prompts).orderBy(desc(prompts.isDefault), asc(prompts.createdAt));
}

export async function getPrompt(id: string) {
  const [row] = await db.select().from(prompts).where(eq(prompts.id, id));
  return row ?? null;
}

export async function createPrompt(input: PromptInput) {
  const data = promptSchema.parse(input);
  const [row] = await db.insert(prompts).values(data).returning();
  return row;
}

export async function updatePrompt(id: string, input: PromptInput) {
  const data = promptSchema.parse(input);
  const [row] = await db.update(prompts).set(data).where(eq(prompts.id, id)).returning();
  return row ?? null;
}

export async function setDefaultPrompt(id: string) {
  await db.transaction(async (tx) => {
    await tx.update(prompts).set({ isDefault: false }).where(ne(prompts.id, id));
    await tx.update(prompts).set({ isDefault: true }).where(eq(prompts.id, id));
  });
}

/** 기본 프롬프트를 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. */
export async function deletePrompt(id: string) {
  const [deleted] = await db.delete(prompts).where(eq(prompts.id, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db.select({ id: prompts.id }).from(prompts).orderBy(asc(prompts.createdAt)).limit(1);
    if (next) await setDefaultPrompt(next.id);
  }
  return Boolean(deleted);
}
