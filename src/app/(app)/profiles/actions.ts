"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { createProfile, deleteProfile, setDefaultProfile, updateProfile } from "@/server/profiles";

export type ProfileFormState = { error?: string };

export async function saveProfile(
  id: string | null,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { id: userId } = await requireUser();
  const input = { name: String(formData.get("name") ?? ""), content: String(formData.get("content") ?? "") };
  try {
    if (id) await updateProfile(userId, id, input);
    else await createProfile(userId, input);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    throw error;
  }
  revalidatePath("/profiles");
  redirect("/profiles");
}

export async function makeDefaultProfile(id: string) {
  const { id: userId } = await requireUser();
  await setDefaultProfile(userId, id);
  revalidatePath("/profiles");
}

export async function removeProfile(id: string) {
  const { id: userId } = await requireUser();
  await deleteProfile(userId, id);
  revalidatePath("/profiles");
  redirect("/profiles");
}
