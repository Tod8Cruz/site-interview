import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateActiveMs, resumeQuestionIndex } from "./interview-time";

test("estimateActiveMs: 턴의 끝 시각과 이전 누적값 중 큰 값", () => {
  assert.equal(estimateActiveMs(null, []), 0);
  assert.equal(estimateActiveMs(5000, []), 5000);
  assert.equal(
    estimateActiveMs(5000, [
      { startMs: 6000, endMs: 9000 },
      { startMs: 9500, endMs: null },
    ]),
    9500,
  );
  assert.equal(estimateActiveMs(20000, [{ startMs: 6000, endMs: 9000 }]), 20000);
});

test("resumeQuestionIndex: 저장값 우선, 없으면 턴의 질문으로 역산", () => {
  const ids = ["q1", "q2", "q3"];
  assert.equal(resumeQuestionIndex(1, [{ questionId: "q3" }], ids), 1);
  assert.equal(resumeQuestionIndex(null, [], ids), null);
  assert.equal(resumeQuestionIndex(undefined, [{ questionId: null }, { questionId: "q2" }, { questionId: "q1" }], ids), 1);
  assert.equal(resumeQuestionIndex(null, [{ questionId: "deleted" }], ids), null);
});
