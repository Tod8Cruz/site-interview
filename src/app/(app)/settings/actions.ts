"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";
import { createApiToken, deleteApiToken } from "@/server/api-tokens";
import { requireUser } from "@/server/auth";
import { createProfile, deleteProfile, setDefaultProfile, updateProfile } from "@/server/profiles";
import { clearOpenAIApiKey, SettingsError, setOpenAIApiKey } from "@/server/settings";

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
  revalidatePath("/settings");
  redirect("/settings");
}

export async function makeDefaultProfile(id: string) {
  const { id: userId } = await requireUser();
  await setDefaultProfile(userId, id);
  revalidatePath("/settings");
}

export async function removeProfile(id: string) {
  const { id: userId } = await requireUser();
  await deleteProfile(userId, id);
  revalidatePath("/settings");
  redirect("/settings");
}

export type ApiTokenFormState = { error?: string; token?: string; name?: string };

/** 발급한 토큰 원문은 이 반환값으로 한 번만 화면에 보여 준다. */
export async function issueApiToken(_prev: ApiTokenFormState, formData: FormData): Promise<ApiTokenFormState> {
  const { id: userId } = await requireUser();
  const expires = String(formData.get("expiresInDays") ?? "");
  try {
    const created = await createApiToken(userId, {
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
  const { id: userId } = await requireUser();
  await deleteApiToken(userId, id);
  revalidatePath("/settings");
}

export type OpenAIKeyFormState = { error?: string; saved?: string };

export async function saveOpenAIKey(_prev: OpenAIKeyFormState, formData: FormData): Promise<OpenAIKeyFormState> {
  const { id: userId } = await requireUser();
  try {
    const hint = await setOpenAIApiKey(userId, String(formData.get("apiKey") ?? ""));
    revalidatePath("/settings");
    return { saved: hint };
  } catch (error) {
    if (error instanceof SettingsError) return { error: error.message };
    throw error;
  }
}

export async function removeOpenAIKey() {
  const { id: userId } = await requireUser();
  await clearOpenAIApiKey(userId);
  revalidatePath("/settings");
}
