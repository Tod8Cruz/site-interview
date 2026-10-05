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

export type QuestionFilter = {
  q?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function whereFor(filter: QuestionFilter) {
  const conditions = [];
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`;
    conditions.push(or(ilike(questions.question, pattern), ilike(questions.modelAnswer, pattern)));
  }
  if (filter.category) conditions.push(eq(questions.category, filter.category));
  if (filter.tag) conditions.push(sql`${filter.tag} = any(${questions.tags})`);
  return conditions.length ? and(...conditions) : undefined;
}

const ordering = [asc(questions.sortOrder), desc(questions.createdAt)];

export async function listQuestions(filter: QuestionFilter = {}) {
  const where = whereFor(filter);
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

export async function getQuestionsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(questions).where(inArray(questions.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function getQuestion(id: string) {
  const [row] = await db.select().from(questions).where(eq(questions.id, id));
  return row ?? null;
}

export async function createQuestion(input: QuestionCreateInput) {
  const data = questionCreateSchema.parse(input);
  const [row] = await db.insert(questions).values(data).returning();
  return row;
}

/** 전부 들어가거나 하나도 안 들어간다. 입력 순서대로 돌려준다. */
export async function createQuestions(input: QuestionBulkCreateInput) {
  const { items } = questionBulkCreateSchema.parse(input);
  return db.insert(questions).values(items).returning();
}

export async function updateQuestion(id: string, input: QuestionUpdateInput) {
  const data = questionUpdateSchema.parse(input);
  const [row] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
  return row ?? null;
}

export async function deleteQuestion(id: string) {
  const [row] = await db.delete(questions).where(eq(questions.id, id)).returning({ id: questions.id });
  return Boolean(row);
}

export async function listCategories() {
  const rows = await db
    .selectDistinct({ category: questions.category })
    .from(questions)
    .where(isNotNull(questions.category))
    .orderBy(asc(questions.category));
  return rows.map((r) => r.category as string);
}

export async function listTags() {
  const rows = await db.execute<{ tag: string }>(
    sql`select distinct unnest(${questions.tags}) as tag from ${questions} order by tag`,
  );
  return rows.rows.map((r) => r.tag);
}
