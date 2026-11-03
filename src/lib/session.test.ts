import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionToken, verifySessionToken } from "./session";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
const userId = "6f1c2b8e-0d4f-4c1a-9a3e-2b7d5e8f9a10";

test("세션 토큰: 서명한 사용자 ID를 돌려준다", async () => {
  assert.equal(await verifySessionToken(await createSessionToken(userId)), userId);
});

test("세션 토큰: 사용자 ID를 바꾸거나 예전 형식이면 거부한다", async () => {
  const [, exp, sig] = (await createSessionToken(userId)).split(".");
  assert.equal(await verifySessionToken(`00000000-0000-0000-0000-000000000000.${exp}.${sig}`), null);
  assert.equal(await verifySessionToken(`${exp}.${sig}`), null);
  assert.equal(await verifySessionToken(undefined), null);
});

test("세션 토큰: 만료되면 거부한다", async () => {
  const payload = `${userId}.${Date.now() - 1000}`;
  const forged = `${payload}.${(await createSessionToken(userId)).split(".")[2]}`;
  assert.equal(await verifySessionToken(forged), null);
});
