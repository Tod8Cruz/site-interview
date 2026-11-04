"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import {
  createQuestionGroup,
  deleteQuestionGroup,
  QuestionGroupError,
  setDefaultQuestionGroup,
  updateQuestionGroup,
} from "@/server/question-groups";

export type GroupFormState = { error?: string };

function failure(error: unknown): GroupFormState {
  if (error instanceof z.ZodError) return { error: formatZodError(error) };
  if (error instanceof QuestionGroupError) return { error: error.message };
  throw error;
}

function refresh() {
  revalidatePath("/questions", "layout");
}

/** id가 없으면 새 그룹을 만들고 그 그룹 화면으로 간다. */
export async function saveGroup(id: string | null, _prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const { id: userId } = await requireUser();
  const input = { name: String(formData.get("name") ?? "") };
  let createdId: string | null = null;
  try {
    if (id) await updateQuestionGroup(userId, id, input);
    else createdId = (await createQuestionGroup(userId, input)).id;
  } catch (error) {
    return failure(error);
  }
  refresh();
  if (createdId) redirect(`/questions/groups/${createdId}`);
  return {};
}

export async function makeDefaultGroup(id: string) {
  const { id: userId } = await requireUser();
  await setDefaultQuestionGroup(userId, id);
  refresh();
}

/** 지우면 그룹 목록으로 간다. 기본 그룹이면 오류를 돌려준다. */
export async function removeGroup(id: string): Promise<GroupFormState> {
  const { id: userId } = await requireUser();
  try {
    await deleteQuestionGroup(userId, id);
  } catch (error) {
    return failure(error);
  }
  refresh();
  redirect("/questions");
}
