import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { profileSchema, type ProfileInput } from "@/lib/validation";

const mine = (userId: string) => eq(candidateProfiles.userId, userId);
const owned = (userId: string, id: string) => and(mine(userId), eq(candidateProfiles.id, id));

export async function listProfiles(userId: string) {
  return db
    .select()
    .from(candidateProfiles)
    .where(mine(userId))
    .orderBy(desc(candidateProfiles.isDefault), asc(candidateProfiles.createdAt));
}

export async function getProfile(userId: string, id: string) {
  const [row] = await db.select().from(candidateProfiles).where(owned(userId, id));
  return row ?? null;
}

/** 첫 프로필은 자동으로 기본값이 된다. */
export async function createProfile(userId: string, input: ProfileInput) {
  const data = profileSchema.parse(input);
  const [existing] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(mine(userId)).limit(1);
  const [row] = await db
    .insert(candidateProfiles)
    .values({ ...data, userId, isDefault: !existing })
    .returning();
  return row;
}

export async function updateProfile(userId: string, id: string, input: ProfileInput) {
  const data = profileSchema.parse(input);
  const [row] = await db.update(candidateProfiles).set(data).where(owned(userId, id)).returning();
  return row ?? null;
}

export async function setDefaultProfile(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: candidateProfiles.id }).from(candidateProfiles).where(owned(userId, id));
    if (!target) return;
    await tx.update(candidateProfiles).set({ isDefault: false }).where(and(mine(userId), ne(candidateProfiles.id, id)));
    await tx.update(candidateProfiles).set({ isDefault: true }).where(owned(userId, id));
  });
}

/** 기본 프로필을 지우면 남은 것 중 가장 오래된 것을 기본값으로 올린다. 지난 면접의 지원자 정보 스냅샷은 그대로 남는다. */
export async function deleteProfile(userId: string, id: string) {
  const [deleted] = await db.delete(candidateProfiles).where(owned(userId, id)).returning();
  if (deleted?.isDefault) {
    const [next] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(mine(userId))
      .orderBy(asc(candidateProfiles.createdAt))
      .limit(1);
    if (next) await setDefaultProfile(userId, next.id);
  }
  return Boolean(deleted);
}
