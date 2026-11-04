"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { QuestionGroupError } from "@/server/question-groups";
import { createQuestion, deleteQuestion, updateQuestion } from "@/server/questions";

export type QuestionFormState = { error?: string };

function fromForm(formData: FormData) {
  return {
    groupId: String(formData.get("groupId") ?? "") || undefined,
    question: String(formData.get("question") ?? ""),
    modelAnswer: String(formData.get("modelAnswer") ?? ""),
  };
}

export async function saveQuestion(
  id: string | null,
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  const { id: userId } = await requireUser();
  const input = fromForm(formData);
  try {
    if (id) await updateQuestion(userId, id, input);
    else await createQuestion(userId, input);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    if (error instanceof QuestionGroupError) return { error: error.message };
    throw error;
  }
  revalidatePath("/questions", "layout");
  // 저장한 질문의 그룹 화면으로 돌아간다.
  redirect(input.groupId ? `/questions/groups/${input.groupId}` : "/questions");
}

/** 지운 뒤 그 질문이 있던 그룹 화면으로 간다. */
export async function removeQuestion(id: string, groupId: string) {
  const { id: userId } = await requireUser();
  await deleteQuestion(userId, id);
  revalidatePath("/questions", "layout");
  redirect(`/questions/groups/${groupId}`);
}
