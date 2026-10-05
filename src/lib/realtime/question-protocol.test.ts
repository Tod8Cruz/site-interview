import assert from "node:assert/strict";
import { test } from "node:test";
import { QuestionTracker, questionProtocol, startQuestionTool } from "./question-protocol";

const questions = [
  { id: "q1", question: "지원동기를 말씀해 주세요." },
  { id: "q2", question: "갈등을 해결한 경험은?" },
  { id: "q3", question: "마지막으로 하고 싶은 말은?" },
];

function call(callId: string, args: unknown, extra: Record<string, unknown>[] = []) {
  const item = {
    type: "function_call",
    name: "start_question",
    call_id: callId,
    arguments: typeof args === "string" ? args : JSON.stringify(args),
  };
  return { type: "response.done", response: { id: "r", status: "completed", output: [...extra, item] } };
}

const parse = (reply: { output: string }) => JSON.parse(reply.output) as Record<string, unknown>;

test("도구 정의와 프로토콜 문구는 질문 수를 반영한다", () => {
  const tool = startQuestionTool(3);
  assert.equal(tool.name, "start_question");
  assert.equal(tool.parameters.properties.index.maximum, 3);
  assert.match(questionProtocol(3), /3개/);
  assert.equal(questionProtocol(0), "");
});

test("start_question이 오면 현재 질문이 넘어가고 질문 원문을 돌려준다", () => {
  const t = new QuestionTracker(questions);
  assert.equal(t.current, null);
  assert.equal(t.currentId, null);
  const replies = t.handle(call("c1", { index: 1 }));
  assert.equal(replies.length, 1);
  assert.equal(replies[0].callId, "c1");
  assert.deepEqual(parse(replies[0]), { ok: true, index: 1, question: "지원동기를 말씀해 주세요." });
  assert.equal(t.current, 0);
  assert.equal(t.currentId, "q1");
});

test("다른 이벤트·다른 도구·메시지 항목은 무시한다", () => {
  const t = new QuestionTracker(questions);
  assert.deepEqual(t.handle({ type: "response.output_item.done", item: { type: "function_call" } }), []);
  const event = call("c1", { index: 1 }, [{ type: "message" }, { type: "function_call", name: "other", call_id: "x" }]);
  assert.equal(t.handle(event).length, 1);
  assert.deepEqual(t.handle({ type: "response.done", response: { id: "r" } }), []);
});

test("같은 번호는 멱등, 뒤로 가면 거부하고 expected를 알려준다", () => {
  const t = new QuestionTracker(questions);
  t.handle(call("c1", { index: 2 }));
  assert.equal(t.current, 1);
  const [same] = t.handle(call("c2", { index: 2 }));
  assert.equal(parse(same).ok, true);
  assert.equal(t.current, 1);
  const [back] = t.handle(call("c3", { index: 1 }));
  assert.equal(parse(back).ok, false);
  assert.equal(parse(back).expected, 3);
  assert.equal(t.current, 1, "뒤로 가는 호출은 상태를 바꾸지 않는다");
});

test("범위 밖·정수 아님·JSON 깨짐은 거부한다", () => {
  const t = new QuestionTracker(questions);
  for (const args of [{ index: 0 }, { index: 4 }, { index: 1.5 }, { index: "1" }, {}, "{not json"]) {
    const [reply] = t.handle(call(`c-${JSON.stringify(args)}`, args));
    assert.equal(parse(reply).ok, false, String(args));
    assert.equal(parse(reply).expected, 1);
  }
  assert.equal(t.current, null);
});

test("앞으로 건너뛰는 호출은 받아들인다", () => {
  const t = new QuestionTracker(questions);
  const [reply] = t.handle(call("c1", { index: 3 }));
  assert.equal(parse(reply).ok, true);
  assert.equal(t.currentId, "q3");
});

test("같은 call_id는 한 번만 처리한다", () => {
  const t = new QuestionTracker(questions);
  assert.equal(t.handle(call("c1", { index: 1 })).length, 1);
  assert.equal(t.handle(call("c1", { index: 1 })).length, 0);
});
