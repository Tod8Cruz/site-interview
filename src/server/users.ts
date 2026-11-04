import "server-only";
import { count, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  apiTokens,
  appSettings,
  candidateProfiles,
  evaluationRubrics,
  interviews,
  prompts,
  questionGroups,
  questions,
  users,
  userSettings,
} from "@/db/schema";
import { signupSchema, type SignupInput } from "@/lib/validation";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./passwords";

export class SignupError extends Error {}

export async function getUser(id: string) {
  const [row] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id));
  return row ?? null;
}

/**
 * 회원가입. 첫 가입자는 계정 기능 이전에 만든 데이터(user_id가 비어 있는 행)와 예전 단일 계정 설정을 넘겨받는다.
 * 동시에 두 명이 처음 가입해도 행 잠금 때문에 한 사람에게만 넘어간다.
 */
export async function createUser(input: SignupInput) {
  const { email, password } = signupSchema.parse(input);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });
    if (!user) throw new SignupError("이미 가입한 이메일입니다.");

    const [{ others }] = await tx.select({ others: count() }).from(users).where(ne(users.id, user.id));
    if (others === 0) {
      for (const table of [questionGroups, questions, prompts, candidateProfiles, evaluationRubrics, interviews, apiTokens]) {
        await tx.update(table).set({ userId: user.id }).where(isNull(table.userId));
      }
      const legacy = await tx.select().from(appSettings);
      if (legacy.length) {
        await tx
          .insert(userSettings)
          .values(legacy.map((row) => ({ userId: user.id, key: row.key, value: row.value })))
          .onConflictDoNothing();
        await tx.delete(appSettings);
      }
    }
    return user;
  });
}

/** 이메일·비밀번호가 맞으면 사용자, 아니면 null. 없는 이메일도 해시 비교를 해서 응답 시간으로 가입 여부가 드러나지 않게 한다. */
export async function authenticateUser(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const [row] = email ? await db.select().from(users).where(eq(users.email, email)) : [];
  const ok = await verifyPassword(password, row?.passwordHash ?? (await dummyPasswordHash()));
  return row && ok ? { id: row.id, email: row.email } : null;
}
