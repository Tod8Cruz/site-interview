import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { questions } from "@/db/schema";
import {
  questionBulkCreateSchema,
  questionCreateSchema,
  questionUpdateSchema,
  type QuestionBulkCreateInput,
  type QuestionCreateInput,
  type QuestionUpdateInput,
} from "@/lib/validation";
import { resolveGroupId } from "./question-groups";

export type QuestionFilter = {
  groupId?: string;
  q?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function whereFor(userId: string, filter: QuestionFilter) {
  const conditions = [eq(questions.userId, userId)];
  if (filter.groupId) conditions.push(eq(questions.groupId, filter.groupId));
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`;
    conditions.push(or(ilike(questions.question, pattern), ilike(questions.modelAnswer, pattern))!);
  }
  if (filter.category) conditions.push(eq(questions.category, filter.category));
  if (filter.tag) conditions.push(sql`${filter.tag} = any(${questions.tags})`);
  return and(...conditions);
}

const ordering = [asc(questions.sortOrder), desc(questions.createdAt)];

export async function listQuestions(userId: string, filter: QuestionFilter = {}) {
  const where = whereFor(userId, filter);
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(questions)
      .where(where)
      .orderBy(...ordering)
      .limit(filter.limit ?? 1000)
      .offset(filter.offset ?? 0),
    db.select({ total: count() }).from(questions).where(where),
  ]);
  return { items, total };
}

/** 이 사용자의 질문만, ids 순서대로. 남의 질문 ID는 조용히 빠진다. */
export async function getQuestionsByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.userId, userId), inArray(questions.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

const owned = (userId: string, id: string) => and(eq(questions.userId, userId), eq(questions.id, id));

export async function getQuestion(userId: string, id: string) {
  const [row] = await db.select().from(questions).where(owned(userId, id));
  return row ?? null;
}

export async function createQuestion(userId: string, input: QuestionCreateInput) {
  const { groupId, ...data } = questionCreateSchema.parse(input);
  const [row] = await db
    .insert(questions)
    .values({ ...data, userId, groupId: await resolveGroupId(userId, groupId) })
    .returning();
  return row;
}

/** 전부 들어가거나 하나도 안 들어간다. 입력 순서대로 돌려준다. */
export async function createQuestions(userId: string, input: QuestionBulkCreateInput) {
  const { items } = questionBulkCreateSchema.parse(input);
  // 그룹은 항목마다 다를 수 있다. 하나라도 없는 그룹이면 아무것도 넣지 않는다.
  const groupIds = new Map<string | undefined, string>();
  for (const { groupId } of items) {
    if (!groupIds.has(groupId)) groupIds.set(groupId, await resolveGroupId(userId, groupId));
  }
  return db
    .insert(questions)
    .values(items.map(({ groupId, ...item }) => ({ ...item, userId, groupId: groupIds.get(groupId)! })))
    .returning();
}

export async function updateQuestion(userId: string, id: string, input: QuestionUpdateInput) {
  const data = questionUpdateSchema.parse(input);
  if (data.groupId) await resolveGroupId(userId, data.groupId);
  const [row] = await db.update(questions).set(data).where(owned(userId, id)).returning();
  return row ?? null;
}

export async function deleteQuestion(userId: string, id: string) {
  const [row] = await db.delete(questions).where(owned(userId, id)).returning({ id: questions.id });
  return Boolean(row);
}

export async function listCategories(userId: string) {
  const rows = await db
    .selectDistinct({ category: questions.category })
    .from(questions)
    .where(and(eq(questions.userId, userId), isNotNull(questions.category)))
    .orderBy(asc(questions.category));
  return rows.map((r) => r.category as string);
}

export async function listTags(userId: string) {
  const rows = await db.execute<{ tag: string }>(
    sql`select distinct unnest(${questions.tags}) as tag from ${questions} where ${questions.userId} = ${userId} order by tag`,
  );
  return rows.rows.map((r) => r.tag);
}
