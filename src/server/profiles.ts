import "server-only";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { profileSchema, type ProfileInput } from "@/lib/validation";

export async function listProfiles() {
  return db
    .select()
    .from(candidateProfiles)
    .orderBy(desc(candidateProfiles.isDefault), asc(candidateProfiles.createdAt));
}

export async function getProfile(id: string) {
  const [row] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.id, id));
  return row ?? null;
}

/** 첫 프로필은 자동으로 기본값이 된다. */
export async function createProfile(input: ProfileInput) {
  const data = profileSchema.parse(input);
  const [existing] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).limit(1);
  const [row] = await db
    .insert(candidateProfiles)
    .values({ ...data, isDefault: !existing })
    .returning();
  return row;
}

export async function updateProfile(id: string, input: ProfileInput) {
  const data = profileSchema.parse(input);
  const [row] = await db.update(candidateProfiles).set(data).where(eq(candidateProfiles.id, id)).returning();
  return row ?? null;
}

export async function setDefaultProfile(id: string) {
  await db.transaction(async (tx) => {
    await tx.update(candidateProfiles).set({ isDefault: false }).where(ne(candidateProfiles.id, id));
    await tx.update(candidateProfiles).set({ isDefault: true }).where(eq(candidateProfiles.id, id));
  });
}

/** 기본 프로필을 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. 지난 면접의 지원자 정보 스냅샷은 그대로 남는다. */
export async function deleteProfile(id: string) {
  const [deleted] = await db.delete(candidateProfiles).where(eq(candidateProfiles.id, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .orderBy(asc(candidateProfiles.createdAt))
      .limit(1);
    if (next) await setDefaultProfile(next.id);
  }
  return Boolean(deleted);
}
