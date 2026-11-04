"use server";

import { revalidatePath } from "next/cache";
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

export type GroupFormState = { error?: string; savedAt?: number };

function failure(error: unknown): GroupFormState {
  if (error instanceof z.ZodError) return { error: formatZodError(error) };
  if (error instanceof QuestionGroupError) return { error: error.message };
  throw error;
}

function refresh() {
  revalidatePath("/questions", "layout");
}

/** id가 없으면 새 그룹을 만든다. 저장하면 savedAt이 바뀌어 새 그룹 입력칸을 비울 수 있다. */
export async function saveGroup(id: string | null, _prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const { id: userId } = await requireUser();
  const input = { name: String(formData.get("name") ?? "") };
  try {
    if (id) await updateQuestionGroup(userId, id, input);
    else await createQuestionGroup(userId, input);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { savedAt: Date.now() };
}

export async function makeDefaultGroup(id: string) {
  const { id: userId } = await requireUser();
  await setDefaultQuestionGroup(userId, id);
  refresh();
}

export async function removeGroup(id: string): Promise<GroupFormState> {
  const { id: userId } = await requireUser();
  try {
    await deleteQuestionGroup(userId, id);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}
