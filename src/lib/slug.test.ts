import assert from "node:assert/strict";
import { test } from "node:test";
import { headingSlug } from "./slug";

test("headingSlug: 경로·기호를 하이픈으로 합치고 한글은 남긴다", () => {
  assert.equal(headingSlug("GET /questions/{id} — 하나 조회"), "get-questions-id-하나-조회");
  assert.equal(headingSlug("데이터 모델: Question"), "데이터-모델-question");
  assert.equal(headingSlug("프롬프트 (면접관 설정)"), "프롬프트-면접관-설정");
  assert.equal(headingSlug("## 오류 ##"), "오류");
});
