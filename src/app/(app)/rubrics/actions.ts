"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { createRubric, deleteRubric, setDefaultRubric, updateRubric } from "@/server/rubrics";

export type RubricFormState = { error?: string };

export async function saveRubric(
  id: string | null,
  _prev: RubricFormState,
  formData: FormData,
): Promise<RubricFormState> {
  let criteria: unknown;
  try {
    criteria = JSON.parse(String(formData.get("criteria") ?? "[]"));
  } catch {
    return { error: "평가 항목 형식이 올바르지 않습니다." };
  }
  const input = { name: String(formData.get("name") ?? ""), criteria } as never;
  try {
    if (id) await updateRubric(id, input);
    else await createRubric(input);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    throw error;
  }
  revalidatePath("/rubrics");
  redirect("/rubrics");
}

export async function makeDefaultRubric(id: string) {
  await setDefaultRubric(id);
  revalidatePath("/rubrics");
}

export async function removeRubric(id: string) {
  await deleteRubric(id);
  revalidatePath("/rubrics");
  redirect("/rubrics");
}
