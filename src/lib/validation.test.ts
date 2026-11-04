import assert from "node:assert/strict";
import { test } from "node:test";
import {
  promptCreateSchema,
  promptUpdateSchema,
  questionCreateSchema,
  questionGroupCreateSchema,
  questionGroupUpdateSchema,
  questionUpdateSchema,
  rubricCreateSchema,
  rubricUpdateSchema,
} from "./validation";

test("프롬프트 생성: 이름·내용만 보내면 나머지는 기본값", () => {
  const parsed = promptCreateSchema.parse({ name: "압박 면접", content: "{{context}} {{questions}}" });
  assert.deepEqual(parsed, {
    name: "압박 면접",
    content: "{{context}} {{questions}}",
    voice: "marin",
    maxMinutes: 20,
    turnDetection: "semantic_vad",
    vadEagerness: "low",
    silenceMs: 1500,
    isDefault: false,
  });
});

test("프롬프트 수정: 보낸 필드만 남고, 빈 본문과 isDefault:false는 거부", () => {
  assert.deepEqual(promptUpdateSchema.parse({ maxMinutes: "30", isDefault: true }), { maxMinutes: 30, isDefault: true });
  assert.equal(promptUpdateSchema.safeParse({}).success, false);
  assert.equal(promptUpdateSchema.safeParse({ isDefault: false }).success, false);
  assert.equal(promptUpdateSchema.safeParse({ voice: "robot" }).success, false);
});

test("평가 기준 생성: 항목에 id가 붙고 중복 id는 거부", () => {
  const parsed = rubricCreateSchema.parse({ name: "개발", criteria: [{ name: "기술 깊이" }, { name: "문제 해결", description: "…" }] });
  assert.equal(parsed.isDefault, false);
  assert.equal(parsed.criteria.length, 2);
  assert.ok(parsed.criteria.every((c) => /^[0-9a-f-]{36}$/.test(c.id)));
  assert.equal(parsed.criteria[0].description, "");

  const id = "6f1c2b8e-0d4f-4c1a-9a3e-2b7d5e8f9a10";
  const dup = rubricCreateSchema.safeParse({ name: "x", criteria: [{ id, name: "a" }, { id, name: "b" }] });
  assert.equal(dup.success, false);
});

test("평가 기준 수정: 이름만, criteria만, isDefault만 각각 가능하고 빈 본문은 거부", () => {
  assert.deepEqual(rubricUpdateSchema.parse({ name: "v2" }), { name: "v2" });
  assert.deepEqual(rubricUpdateSchema.parse({ isDefault: true }), { isDefault: true });
  assert.equal(rubricUpdateSchema.parse({ criteria: [{ name: "a" }] }).criteria?.length, 1);
  assert.equal(rubricUpdateSchema.safeParse({}).success, false);
  assert.equal(rubricUpdateSchema.safeParse({ criteria: [] }).success, false);
  assert.equal(rubricUpdateSchema.safeParse({ isDefault: false }).success, false);
});

test("질문 그룹: 이름은 필수이고 앞뒤 공백을 지운다. 수정은 isDefault:true만 받는다", () => {
  assert.deepEqual(questionGroupCreateSchema.parse({ name: "  ○○교대  " }), { name: "○○교대", isDefault: false });
  assert.equal(questionGroupCreateSchema.safeParse({ name: " " }).success, false);
  assert.deepEqual(questionGroupUpdateSchema.parse({ isDefault: true }), { isDefault: true });
  assert.equal(questionGroupUpdateSchema.safeParse({ isDefault: false }).success, false);
  assert.equal(questionGroupUpdateSchema.safeParse({}).success, false);
});

test("질문의 groupId: 생략 가능(기본 그룹), 있으면 uuid여야 한다", () => {
  assert.equal(questionCreateSchema.parse({ question: "자기소개" }).groupId, undefined);
  assert.equal(questionCreateSchema.safeParse({ question: "자기소개", groupId: "기본" }).success, false);
  const id = "6f1c2b8e-0d4f-4c1a-9a3e-2b7d5e8f9a10";
  assert.deepEqual(questionUpdateSchema.parse({ groupId: id }), { groupId: id });
});
