import "server-only";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { questionGroups, questions } from "@/db/schema";
import {
  questionGroupCreateSchema,
  questionGroupUpdateSchema,
  type QuestionGroupCreateInput,
  type QuestionGroupUpdateInput,
} from "@/lib/validation";

/** 그룹 규칙을 어긴 요청(없는 그룹 지정, 기본 그룹 삭제). API에서는 400 bad_request가 된다. */
export class QuestionGroupError extends Error {}

const DEFAULT_GROUP_NAME = "기본";

const mine = (userId: string) => eq(questionGroups.userId, userId);
const owned = (userId: string, id: string) => and(mine(userId), eq(questionGroups.id, id));

/** 기본 그룹 id. 그룹이 하나도 없으면 "기본" 그룹을 만든다. 동시에 불려도 기본값 유일 인덱스 덕에 하나만 생긴다. */
export async function ensureDefaultGroup(userId: string) {
  const [existing] = await db
    .select({ id: questionGroups.id })
    .from(questionGroups)
    .where(and(mine(userId), eq(questionGroups.isDefault, true)));
  if (existing) return existing.id;
  await db.insert(questionGroups).values({ userId, name: DEFAULT_GROUP_NAME, isDefault: true }).onConflictDoNothing();
  const [created] = await db
    .select({ id: questionGroups.id })
    .from(questionGroups)
    .where(and(mine(userId), eq(questionGroups.isDefault, true)));
  return created.id;
}

/** 기본 그룹이 맨 앞, 나머지는 만든 순서. 각 그룹의 질문 수를 함께 준다. */
export async function listQuestionGroups(userId: string) {
  await ensureDefaultGroup(userId);
  const rows = await db
    .select({ group: questionGroups, questionCount: count(questions.id) })
    .from(questionGroups)
    .leftJoin(questions, eq(questions.groupId, questionGroups.id))
    .where(mine(userId))
    .groupBy(questionGroups.id)
    .orderBy(desc(questionGroups.isDefault), asc(questionGroups.createdAt));
  return rows.map((r) => ({ ...r.group, questionCount: r.questionCount }));
}

export async function getQuestionGroup(userId: string, id: string) {
  const [row] = await db.select().from(questionGroups).where(owned(userId, id));
  return row ?? null;
}

/** 질문을 넣을 그룹 id. 지정하지 않으면 기본 그룹, 지정했는데 이 사용자의 그룹이 아니면 오류. */
export async function resolveGroupId(userId: string, groupId: string | undefined) {
  if (!groupId) return ensureDefaultGroup(userId);
  if (!(await getQuestionGroup(userId, groupId))) throw new QuestionGroupError("질문 그룹을 찾을 수 없습니다.");
  return groupId;
}

export async function createQuestionGroup(userId: string, input: QuestionGroupCreateInput) {
  const { isDefault, ...data } = questionGroupCreateSchema.parse(input);
  await ensureDefaultGroup(userId);
  const [row] = await db.insert(questionGroups).values({ ...data, userId }).returning();
  if (isDefault) {
    await setDefaultQuestionGroup(userId, row.id);
    return (await getQuestionGroup(userId, row.id)) ?? row;
  }
  return row;
}

export async function updateQuestionGroup(userId: string, id: string, input: QuestionGroupUpdateInput) {
  const { isDefault, ...data } = questionGroupUpdateSchema.parse(input);
  if (Object.keys(data).length > 0) {
    const [row] = await db
      .update(questionGroups)
      .set(data)
      .where(owned(userId, id))
      .returning({ id: questionGroups.id });
    if (!row) return null;
  }
  if (isDefault) await setDefaultQuestionGroup(userId, id);
  return getQuestionGroup(userId, id);
}

export async function setDefaultQuestionGroup(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: questionGroups.id }).from(questionGroups).where(owned(userId, id));
    if (!target) return;
    await tx.update(questionGroups).set({ isDefault: false }).where(and(mine(userId), ne(questionGroups.id, id)));
    await tx.update(questionGroups).set({ isDefault: true }).where(owned(userId, id));
  });
}

/** 그룹을 지우면 그 질문들은 기본 그룹으로 옮긴다. 기본 그룹은 지울 수 없다. 지운 그룹이 없으면 false. */
export async function deleteQuestionGroup(userId: string, id: string) {
  const group = await getQuestionGroup(userId, id);
  if (!group) return false;
  if (group.isDefault) {
    throw new QuestionGroupError("기본 그룹은 지울 수 없습니다. 다른 그룹을 기본값으로 바꾼 뒤 지우세요.");
  }
  const defaultId = await ensureDefaultGroup(userId);
  await db.transaction(async (tx) => {
    await tx.update(questions).set({ groupId: defaultId }).where(eq(questions.groupId, id));
    await tx.delete(questionGroups).where(owned(userId, id));
  });
  return true;
}
