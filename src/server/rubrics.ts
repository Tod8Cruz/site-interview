import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluationRubrics } from "@/db/schema";
import { SEED_RUBRICS } from "@/lib/evaluation";
import {
  rubricCreateSchema,
  rubricUpdateSchema,
  type RubricCreateInput,
  type RubricUpdateInput,
} from "@/lib/validation";

const mine = (userId: string) => eq(evaluationRubrics.userId, userId);
const owned = (userId: string, id: string) => and(mine(userId), eq(evaluationRubrics.id, id));

/** 루브릭이 하나도 없으면 시드를 넣는다(프롬프트 시드와 같은 방식). */
export async function ensureSeedRubrics(userId: string) {
  const [existing] = await db.select({ id: evaluationRubrics.id }).from(evaluationRubrics).where(mine(userId)).limit(1);
  if (existing) return;
  await db
    .insert(evaluationRubrics)
    .values(SEED_RUBRICS.map((r) => ({ ...r, userId, criteria: r.criteria.map((c) => ({ ...c, id: randomUUID() })) })))
    .onConflictDoNothing();
}

export async function listRubrics(userId: string) {
  await ensureSeedRubrics(userId);
  return db.select().from(evaluationRubrics).where(mine(userId)).orderBy(desc(evaluationRubrics.isDefault), asc(evaluationRubrics.createdAt));
}

export async function getRubric(userId: string, id: string) {
  const [row] = await db.select().from(evaluationRubrics).where(owned(userId, id));
  return row ?? null;
}

/** 기본 루브릭. 기본값 표시가 없으면 가장 오래된 것. */
export async function getDefaultRubric(userId: string) {
  await ensureSeedRubrics(userId);
  const [row] = await db
    .select()
    .from(evaluationRubrics)
    .where(mine(userId))
    .orderBy(desc(evaluationRubrics.isDefault), asc(evaluationRubrics.createdAt))
    .limit(1);
  return row ?? null;
}

/** 첫 평가 기준은 자동으로 기본값이 된다. isDefault: true면 기존 기본값을 내리고 이것을 올린다. */
export async function createRubric(userId: string, input: RubricCreateInput) {
  const { isDefault, ...data } = rubricCreateSchema.parse(input);
  const [existing] = await db.select({ id: evaluationRubrics.id }).from(evaluationRubrics).where(mine(userId)).limit(1);
  const [row] = await db
    .insert(evaluationRubrics)
    .values({ ...data, userId, isDefault: !existing })
    .returning();
  if (isDefault && existing) {
    await setDefaultRubric(userId, row.id);
    return (await getRubric(userId, row.id)) ?? row;
  }
  return row;
}

/** 보낸 필드만 바꾼다(UI 폼은 전체를 보낸다). criteria는 배열 전체를 바꾼다. isDefault: true면 기본값으로 올린다. */
export async function updateRubric(userId: string, id: string, input: RubricUpdateInput) {
  const { isDefault, ...data } = rubricUpdateSchema.parse(input);
  if (Object.keys(data).length > 0) {
    const [row] = await db
      .update(evaluationRubrics)
      .set(data)
      .where(owned(userId, id))
      .returning({ id: evaluationRubrics.id });
    if (!row) return null;
  }
  if (isDefault) await setDefaultRubric(userId, id);
  return getRubric(userId, id);
}

export async function setDefaultRubric(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: evaluationRubrics.id }).from(evaluationRubrics).where(owned(userId, id));
    if (!target) return;
    await tx.update(evaluationRubrics).set({ isDefault: false }).where(and(mine(userId), ne(evaluationRubrics.id, id)));
    await tx.update(evaluationRubrics).set({ isDefault: true }).where(owned(userId, id));
  });
}

/** 기본 루브릭을 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. 저장된 평가는 스냅샷이라 영향이 없다. */
export async function deleteRubric(userId: string, id: string) {
  const [deleted] = await db.delete(evaluationRubrics).where(owned(userId, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db
      .select({ id: evaluationRubrics.id })
      .from(evaluationRubrics)
      .where(mine(userId))
      .orderBy(asc(evaluationRubrics.createdAt))
      .limit(1);
    if (next) await setDefaultRubric(userId, next.id);
  }
  return Boolean(deleted);
}
