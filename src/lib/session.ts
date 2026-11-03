// proxy(Node 런타임)와 서버 코드 양쪽에서 쓰므로 Web Crypto만 사용한다.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 세션 토큰: `사용자ID.만료시각.서명`. DB 조회 없이 proxy에서 검증할 수 있다. */
export async function createSessionToken(userId: string) {
  const payload = `${userId}.${Date.now() + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${await sign(payload)}`;
}

/** 유효하면 사용자 ID, 아니면 null (예전 단일 계정 형식의 토큰도 null) */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [userId, exp, sig, ...rest] = token.split(".");
  if (!userId || !exp || !sig || rest.length || Number(exp) < Date.now()) return null;
  return constantTimeEqual(sig, await sign(`${userId}.${exp}`)) ? userId : null;
}

export { constantTimeEqual };
