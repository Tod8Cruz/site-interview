import assert from "node:assert/strict";
import { test } from "node:test";
import { segmentAt, sortSegments, totalDurationMs } from "./segments";

const segments = [
  { url: "a", startMs: 0, durationMs: 60_000 },
  { url: "b", startMs: 60_000, durationMs: 30_000 },
];

test("segmentAt: 경계는 뒤 구간, 시작 전은 -1", () => {
  assert.equal(segmentAt(segments, 0), 0);
  assert.equal(segmentAt(segments, 59_999), 0);
  assert.equal(segmentAt(segments, 60_000), 1);
  assert.equal(segmentAt(segments, 95_000), 1);
  assert.equal(segmentAt([], 10), -1);
  assert.equal(segmentAt([{ url: "x", startMs: 1000, durationMs: 10 }], 10), -1);
});

test("totalDurationMs와 정렬", () => {
  assert.equal(totalDurationMs(segments), 90_000);
  assert.equal(totalDurationMs([]), 0);
  assert.deepEqual(sortSegments([segments[1], segments[0]]).map((s) => s.url), ["a", "b"]);
});
