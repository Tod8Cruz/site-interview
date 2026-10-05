import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * DB에 넣는 비밀값(OpenAI API 키 등)의 대칭 암호화.
 * 키는 이미 필수인 SESSION_SECRET에서 파생하므로 환경변수를 더 늘리지 않는다.
 * SESSION_SECRET을 바꾸면 저장된 비밀값은 못 읽게 되니 다시 등록해야 한다.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** 형식이 어긋나거나 키가 바뀌어 복호화에 실패하면 null */
export function decryptSecret(stored: string): string | null {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
