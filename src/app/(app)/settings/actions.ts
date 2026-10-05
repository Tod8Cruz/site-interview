"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { createApiToken, deleteApiToken } from "@/server/api-tokens";
import { createProfile, deleteProfile, setDefaultProfile, updateProfile } from "@/server/profiles";

export type ProfileFormState = { error?: string };

export async function saveProfile(
  id: string | null,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const input = { name: String(formData.get("name") ?? ""), content: String(formData.get("content") ?? "") };
  try {
    if (id) await updateProfile(id, input);
    else await createProfile(input);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    throw error;
  }
  revalidatePath("/settings");
  redirect("/settings");
}

export async function makeDefaultProfile(id: string) {
  await setDefaultProfile(id);
  revalidatePath("/settings");
}

export async function removeProfile(id: string) {
  await deleteProfile(id);
  revalidatePath("/settings");
  redirect("/settings");
}

export type ApiTokenFormState = { error?: string; token?: string; name?: string };

/** 발급한 토큰 원문은 이 반환값으로 한 번만 화면에 보여 준다. */
export async function issueApiToken(_prev: ApiTokenFormState, formData: FormData): Promise<ApiTokenFormState> {
  const expires = String(formData.get("expiresInDays") ?? "");
  try {
    const created = await createApiToken({
      name: String(formData.get("name") ?? ""),
      expiresInDays: expires ? Number(expires) : null,
    });
    revalidatePath("/settings");
    return { token: created.token, name: created.name };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: formatZodError(error) };
    throw error;
  }
}

export async function revokeApiToken(id: string) {
  await deleteApiToken(id);
  revalidatePath("/settings");
}
