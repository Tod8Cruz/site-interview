import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { InterviewSession, type SessionSnapshot } from "./interview-session";
import type { ResponseGate } from "./response-gate";
import type { ServerEvent } from "./turn-tracker";

/** 브라우저 전송 경계만 대체하고 실제 세션의 이벤트 처리·마이크 게이트·종료 경로를 실행한다. */
function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
  const sent: Record<string, unknown>[] = [];
  const snapshots: SessionSnapshot[] = [];
  const track = { enabled: true, stop() {} };
  const session = new InterviewSession("test", 10, [{ id: "q1", question: "지원동기는?" }], {
    onChange: (s) => snapshots.push(s),
    onEnded: () => {},
  });
  const internal = session as unknown as {
    state: SessionSnapshot;
    channel: RTCDataChannel;
    mic: MediaStream;
    gate: ResponseGate;
    wrapUpPending: boolean;
    onServerEvent(raw: unknown): void;
  };
  internal.state = { ...session.snapshot, phase: "live" };
  internal.mic = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  internal.channel = {
    readyState: "open",
    send(raw: string) {
      const event = JSON.parse(raw);
      if (event.type === "response.create") assert.equal(track.enabled, false);
      sent.push(event);
    },
    close() {},
  } as unknown as RTCDataChannel;
  session.setMuted(false);
  t.after(() => internal.gate.dispose());
  return {
    session, internal, track, sent, snapshots,
    event(event: ServerEvent) { internal.onServerEvent(JSON.stringify(event)); },
  };
}

test("세션: 도구 출력 뒤 후속 응답을 요청하고 이전 음성 종료에도 마이크를 닫아 둔다", (t) => {
  const s = setup(t);
  s.internal.gate.request();
  s.snapshots.length = 0;
  s.event({ type: "response.created", response: { id: "r1" } });
  s.event({ type: "output_audio_buffer.started", response_id: "r1" });
  s.event({ type: "response.done", response: {
    id: "r1", status: "completed",
    output: [
      { type: "message" },
      { type: "function_call", name: "start_question", call_id: "call1", arguments: '{"index":1}' },
    ],
  } });
  assert.deepEqual(s.sent.map((e) => e.type), ["response.create", "conversation.item.create", "response.create"]);
  assert.equal(s.session.snapshot.currentQuestionIndex, 0);
  s.event({ type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(s.track.enabled, false);
  s.event({ type: "response.created", response: { id: "r2" } });
  s.event({ type: "output_audio_buffer.started", response_id: "r2" });
  s.event({ type: "response.done", response: { id: "r2", status: "completed" } });
  assert.equal(s.track.enabled, false);
  assert.ok(s.snapshots.every((state) => !state.micOpen));
  s.event({ type: "output_audio_buffer.stopped", response_id: "r2" });
  assert.equal(s.track.enabled, true);
});

test("세션: 마무리 지시를 먼저 보내고 유예 후 한 번만 응답한다", (t) => {
  const s = setup(t);
  s.internal.wrapUpPending = true;
  s.event({ type: "input_audio_buffer.speech_started", item_id: "u1" });
  s.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  s.event({ type: "input_audio_buffer.committed", item_id: "u1" });
  assert.deepEqual(s.sent.map((e) => e.type), ["conversation.item.create"]);
  t.mock.timers.tick(1000);
  assert.deepEqual(s.sent.map((e) => e.type), ["conversation.item.create", "response.create"]);
  assert.equal(s.session.snapshot.wrapUpSent, true);
});

test("세션: 요청 오류를 게이트까지 전달하고 저장 후 종료한다", async (t) => {
  const s = setup(t);
  s.event({ type: "input_audio_buffer.speech_started", item_id: "u1" });
  s.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  s.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "답변입니다" });
  s.event({ type: "input_audio_buffer.committed", item_id: "u1" });
  t.mock.timers.tick(1000);
  s.event({ type: "error", error: { code: "invalid_request_error", event_id: s.sent[0].event_id } });
  const result = await s.session.end("error");
  assert.equal(result.status, "paused");
  assert.equal(result.metrics.requestFailureCount, 1);
  assert.equal(s.session.snapshot.phase, "ended");
  assert.equal(s.track.enabled, false);
  assert.match(s.session.snapshot.error!, /요청이 거절/);
  t.mock.timers.tick(20_000);
  assert.equal(s.sent.length, 1);
});

test("세션: 유예 도중 일시정지하면 이후 응답을 보내거나 마이크를 열지 않는다", async (t) => {
  const s = setup(t);
  s.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  s.event({ type: "input_audio_buffer.committed", item_id: "u1" });
  await s.session.pause();
  t.mock.timers.tick(1000);
  s.event({ type: "response.done", response: { id: "late", status: "completed" } });
  assert.equal(s.sent.length, 0);
  assert.equal(s.track.enabled, false);
});

test("세션: 응답 요청 뒤 늦은 발화는 저장 후 일시정지하고 후속 요청을 차단한다", async (t) => {
  const s = setup(t);
  s.event({ type: "input_audio_buffer.speech_started", item_id: "u1" });
  s.event({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  s.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "앞선 답변" });
  s.event({ type: "input_audio_buffer.committed", item_id: "u1" });
  t.mock.timers.tick(1000);
  s.event({ type: "input_audio_buffer.speech_started", item_id: "late" });
  s.event({ type: "response.done", response: { id: "r1", status: "completed", output: [
    { type: "function_call", name: "start_question", call_id: "call1", arguments: '{"index":1}' },
  ] } });
  const result = await s.session.end("error");
  assert.equal(result.status, "paused");
  assert.equal(result.metrics.lateSpeechCount, 1);
  assert.equal(s.session.snapshot.currentQuestionIndex, null);
  assert.match(s.session.snapshot.error!, /마지막 답변을 다시/);
  assert.equal(s.sent.length, 1);
  assert.equal(s.track.enabled, false);
});
