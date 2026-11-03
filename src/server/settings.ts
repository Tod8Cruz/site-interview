import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { OPENAI_BASE_URL } from "./openai";
import { decryptSecret, encryptSecret } from "./secrets";

const OPENAI_API_KEY = "openai_api_key";

export class SettingsError extends Error {}

async function readSetting(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
  return row ?? null;
}

async function writeSetting(userId: string, key: string, value: string) {
  await db
    .insert(userSettings)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value, updatedAt: new Date() } });
}

/**
 * 이 사용자의 OpenAI 호출(Realtime 면접·평가·통화 종료)에 쓸 API 키. 설정 화면에서 등록한 키(DB, 암호화)만 쓴다.
 * 사용량이 다른 사람의 키로 과금되지 않도록 서버 환경변수로 대신하지 않는다.
 */
export async function getOpenAIApiKey(userId: string): Promise<string | null> {
  const row = await readSetting(userId, OPENAI_API_KEY).catch((error) => {
    console.error("OpenAI 키 조회 실패", error);
    return null;
  });
  if (!row) return null;
  const key = decryptSecret(row.value);
  if (!key) console.error("저장된 OpenAI 키를 복호화하지 못했습니다. SESSION_SECRET이 바뀌었다면 키를 다시 등록하세요.");
  return key;
}

export type OpenAIKeyStatus = {
  registered: boolean;
  /** 화면 표시용 마스킹 (예: sk-proj…Ab3d) */
  hint: string | null;
  updatedAt: Date | null;
  /** DB에 행은 있는데 복호화가 안 되는 상태 (SESSION_SECRET 변경 등) */
  unreadable: boolean;
};

export function maskKey(key: string) {
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export async function getOpenAIKeyStatus(userId: string): Promise<OpenAIKeyStatus> {
  const row = await readSetting(userId, OPENAI_API_KEY);
  if (!row) return { registered: false, hint: null, updatedAt: null, unreadable: false };
  const key = decryptSecret(row.value);
  if (key) return { registered: true, hint: maskKey(key), updatedAt: row.updatedAt, unreadable: false };
  return { registered: false, hint: null, updatedAt: row.updatedAt, unreadable: true };
}

/** 키가 실제로 동작하는지 OpenAI에 가볍게 확인한다(models 목록). 네트워크 오류는 저장을 막지 않는다. */
async function verifyOpenAIApiKey(key: string): Promise<string | null> {
  try {
    const response = await fetch(`${OPENAI_BASE_URL()}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) return "OpenAI가 이 키를 거부했습니다. 키를 다시 확인해 주세요.";
    if (response.status === 403) return "이 키에는 권한이 없습니다. 프로젝트·권한 설정을 확인해 주세요.";
    return null;
  } catch (error) {
    console.warn("OpenAI 키 확인 요청 실패(저장은 진행)", error);
    return null;
  }
}

export async function setOpenAIApiKey(userId: string, input: string) {
  const key = input.trim();
  if (!key) throw new SettingsError("API 키를 입력하세요.");
  if (/\s/.test(key) || key.length < 20 || key.length > 500) throw new SettingsError("API 키 형식이 올바르지 않습니다.");
  if (!key.startsWith("sk-")) throw new SettingsError("OpenAI API 키는 보통 sk-로 시작합니다. 키를 다시 확인해 주세요.");
  const problem = await verifyOpenAIApiKey(key);
  if (problem) throw new SettingsError(problem);
  await writeSetting(userId, OPENAI_API_KEY, encryptSecret(key));
  return maskKey(key);
}

export async function clearOpenAIApiKey(userId: string) {
  await db.delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, OPENAI_API_KEY)));
}
