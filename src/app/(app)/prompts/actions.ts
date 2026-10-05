"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { createPrompt, deletePrompt, setDefaultPrompt, updatePrompt } from "@/server/prompts";

export type PromptFormState = { error?: string };

export async function savePrompt(
  id: string | null,
  _prev: PromptFormState,
  formData: FormData,
): Promise<PromptFormState> {
  const input = {
    name: String(formData.get("name") ?? ""),
    content: String(formData.get("content") ?? ""),
    voice: String(formData.get("voice") ?? ""),
    maxMinutes: String(formData.get("maxMinutes") ?? ""),
    turnDetection: String(formData.get("turnDetection") ?? ""),
    vadEagerness: String(formData.get("vadEagerness") ?? "low"),
    silenceMs: String(formData.get("silenceMs") ?? "1500"),
  } as never;
  try {
    if (id) await updatePrompt(id, input);
    else await createPrompt(input);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    throw error;
  }
  revalidatePath("/prompts");
  redirect("/prompts");
}

export async function makeDefault(id: string) {
  await setDefaultPrompt(id);
  revalidatePath("/prompts");
}

export async function removePrompt(id: string) {
  await deletePrompt(id);
  revalidatePath("/prompts");
  redirect("/prompts");
}
