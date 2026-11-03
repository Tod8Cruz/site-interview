import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseGate } from "./response-gate";
import type { ServerEvent } from "./turn-tracker";

function setup(sendResult = true) {
  let now = 0;
  let sequence = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sent: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const changes: boolean[] = [];
  const gate: ResponseGate = new ResponseGate({
    delayMs: 1000,
    setTimer(fn, ms) {
      timers.set(++sequence, { at: now + ms, fn });
      return sequence;
    },
    clearTimer: (id) => { timers.delete(id as number); },
    send(event) {
      assert.equal(gate.awaitingResponse, true, "전송 전에 마이크가 잠겨야 한다");
      sent.push(event);
      return sendResult;
    },
    onChange: () => changes.push(gate.awaitingResponse),
    onFailure: (message) => failures.push(message),
  });
  const event = (event: ServerEvent, followUp = false) => gate.handle(event, followUp);
  return {
    gate, sent, failures, changes, event,
    tick(ms: number) {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = target;
    },
    stop(id = "u1") {
      event({ type: "input_audio_buffer.speech_stopped", item_id: id });
      event({ type: "input_audio_buffer.committed", item_id: id });
    },
    created(id = "r1") {
      event({ type: "response.created", response: { id } });
    },
    done(id = "r1", followUp = false) {
      event({ type: "response.done", response: { id, status: "completed" } }, followUp);
    },
  };
}

test("끊어 말하기는 마지막 조각이 확정되고 유예가 지난 뒤 한 번만 응답한다", () => {
  const s = setup();
  s.stop();
  s.tick(999);
  s.event({ type: "input_audio_buffer.speech_started", item_id: "u2" });
  s.tick(1000);
  assert.equal(s.sent.length, 0);
  s.stop("u2");
  s.tick(999);
  assert.equal(s.sent.length, 0);
  s.tick(1);
  assert.equal(s.sent.length, 1);
  assert.equal(s.gate.awaitingResponse, true);
});

test("유예가 끝나도 입력 commit 전에는 응답을 만들지 않는다", () => {
  const s = setup();
  s.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  s.tick(1000);
  assert.equal(s.sent.length, 0);
  s.event({ type: "input_audio_buffer.committed", item_id: "u1" });
  assert.equal(s.sent.length, 1);
});

test("유예 만료 직후의 발화는 후속 질문에 섞지 않고 복구를 요청한다", () => {
  const s = setup();
  s.stop();
  s.tick(1000);
  s.event({ type: "input_audio_buffer.speech_started", item_id: "late" });
  s.stop("late");
  s.tick(20_000);
  assert.equal(s.sent.length, 1);
  assert.equal(s.failures.length, 1);
  assert.equal(s.gate.lateSpeechCount, 1);
  assert.equal(s.gate.requestFailureCount, 0);
});

test("이전 음성이 끝나도 도구 후속 응답 생성 중에는 마이크가 열리지 않는다", () => {
  const s = setup();
  s.gate.request();
  s.created();
  s.event({ type: "output_audio_buffer.started", response_id: "r1" });
  s.done("r1", true); // '잠시만요' 음성 뒤 도구 호출
  s.event({ type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(s.gate.awaitingResponse, true);
  s.created("r2");
  s.event({ type: "output_audio_buffer.started", response_id: "r2" });
  s.done("r2");
  assert.ok(s.changes.every(Boolean), "후속 응답이 끝나기 전에는 잠금을 유지한다");
  s.event({ type: "output_audio_buffer.stopped", response_id: "r2" });
  assert.equal(s.gate.awaitingResponse, false);
  assert.equal(s.sent.length, 2);
});

test("도구만 있는 응답, 무음 응답, 늦은 이전 종료 이벤트를 구분한다", () => {
  const s = setup();
  s.gate.request();
  s.created();
  s.done("r1", true);
  s.event({ type: "output_audio_buffer.cleared", response_id: "r1" });
  assert.equal(s.gate.awaitingResponse, true);
  s.created("r2");
  s.done("r2");
  assert.equal(s.gate.awaitingResponse, false);
});

test("생성 종료 전 재생 clear가 와도 생성 종료까지 잠금을 유지한다", () => {
  const s = setup();
  s.gate.request();
  s.created();
  s.event({ type: "output_audio_buffer.started", response_id: "r1" });
  s.event({ type: "output_audio_buffer.cleared", response_id: "r1" });
  assert.equal(s.gate.awaitingResponse, true);
  s.done();
  assert.equal(s.gate.awaitingResponse, false);
});

test("audio 출력이 있으면 started 수신 전 done이어도 재생 종료를 기다린다", () => {
  const s = setup();
  s.gate.request();
  s.created();
  s.event({ type: "response.done", response: { id: "r1", status: "completed", output: [{ content: [{ type: "audio" }] }] } });
  assert.equal(s.gate.awaitingResponse, true);
  s.event({ type: "output_audio_buffer.started", response_id: "r1" });
  s.event({ type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(s.gate.awaitingResponse, false);
});

test("응답 중 늦은 speech_stopped는 중복 응답을 만들지 않는다", () => {
  const s = setup();
  s.gate.request();
  s.created();
  s.stop("late");
  s.tick(2000);
  assert.equal(s.sent.length, 1);
});

test("관련 요청 오류만 복구하며 중복 응답 오류도 무한 잠금으로 남지 않는다", () => {
  for (const code of ["conversation_already_has_active_response", "invalid_request_error"]) {
    const s = setup();
    s.gate.request();
    s.event({ type: "error", error: { code, event_id: "unrelated" } });
    assert.equal(s.failures.length, 0);
    s.event({ type: "error", error: { code, event_id: s.sent[0].event_id } });
    assert.equal(s.failures.length, 1);
    assert.equal(s.gate.requestFailureCount, 1);
  }
});

test("전송 실패와 응답 요청 확인 시간 초과는 복구 경로로 보낸다", () => {
  const failed = setup(false);
  failed.gate.request();
  assert.equal(failed.failures.length, 1);
  const timeout = setup();
  timeout.gate.request();
  timeout.tick(15_000);
  assert.equal(timeout.failures.length, 1);
  const accepted = setup();
  accepted.gate.request();
  accepted.created();
  accepted.tick(15_000);
  assert.equal(accepted.failures.length, 0);
});

test("실패·취소·불완전 응답에는 도구 후속 응답을 만들지 않는다", () => {
  for (const status of ["failed", "cancelled", "incomplete"]) {
    const s = setup();
    s.gate.request();
    s.created();
    s.event({ type: "response.done", response: { id: "r1", status } }, true);
    assert.equal(s.sent.length, 1);
    assert.equal(s.failures.length, 1);
  }
});

test("종료 뒤 유예·확인 타이머와 늦은 이벤트는 아무 작업도 하지 않는다", () => {
  for (const pending of [false, true]) {
    const s = setup();
    if (pending) s.gate.request(); else s.stop();
    s.gate.dispose();
    s.tick(20_000);
    s.stop("late");
    s.gate.request();
    s.tick(20_000);
    assert.equal(s.sent.length, pending ? 1 : 0);
    assert.equal(s.failures.length, 0);
  }
});
