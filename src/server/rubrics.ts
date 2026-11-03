import "server-only";
import { randomUUID } from "node:crypto";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluationRubrics } from "@/db/schema";
import { SEED_RUBRICS } from "@/lib/evaluation";
import { rubricSchema, type RubricInput } from "@/lib/validation";

/** 루브릭이 하나도 없으면 시드를 넣는다(프롬프트 시드와 같은 방식). */
export async function ensureSeedRubrics() {
  const [existing] = await db.select({ id: evaluationRubrics.id }).from(evaluationRubrics).limit(1);
  if (existing) return;
  await db
    .insert(evaluationRubrics)
    .values(SEED_RUBRICS.map((r) => ({ ...r, criteria: r.criteria.map((c) => ({ ...c, id: randomUUID() })) })))
    .onConflictDoNothing();
}

export async function listRubrics() {
  await ensureSeedRubrics();
  return db.select().from(evaluationRubrics).orderBy(desc(evaluationRubrics.isDefault), asc(evaluationRubrics.createdAt));
}

export async function getRubric(id: string) {
  const [row] = await db.select().from(evaluationRubrics).where(eq(evaluationRubrics.id, id));
  return row ?? null;
}

/** 기본 루브릭. 기본값 표시가 없으면 가장 오래된 것. */
export async function getDefaultRubric() {
  await ensureSeedRubrics();
  const [row] = await db
    .select()
    .from(evaluationRubrics)
    .orderBy(desc(evaluationRubrics.isDefault), asc(evaluationRubrics.createdAt))
    .limit(1);
  return row ?? null;
}

export async function createRubric(input: RubricInput) {
  const data = rubricSchema.parse(input);
  const [row] = await db.insert(evaluationRubrics).values(data).returning();
  return row;
}

export async function updateRubric(id: string, input: RubricInput) {
  const data = rubricSchema.parse(input);
  const [row] = await db.update(evaluationRubrics).set(data).where(eq(evaluationRubrics.id, id)).returning();
  return row ?? null;
}

export async function setDefaultRubric(id: string) {
  await db.transaction(async (tx) => {
    await tx.update(evaluationRubrics).set({ isDefault: false }).where(ne(evaluationRubrics.id, id));
    await tx.update(evaluationRubrics).set({ isDefault: true }).where(eq(evaluationRubrics.id, id));
  });
}

/** 기본 루브릭을 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. 저장된 평가는 스냅샷이라 영향이 없다. */
export async function deleteRubric(id: string) {
  const [deleted] = await db.delete(evaluationRubrics).where(eq(evaluationRubrics.id, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db
      .select({ id: evaluationRubrics.id })
      .from(evaluationRubrics)
      .orderBy(asc(evaluationRubrics.createdAt))
      .limit(1);
    if (next) await setDefaultRubric(next.id);
  }
  return Boolean(deleted);
}
