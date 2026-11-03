import assert from "node:assert/strict";
import { test } from "node:test";
import { TurnTracker, type FinalTurn } from "./turn-tracker";

function setup() {
  let clock = 0;
  const finals: FinalTurn[] = [];
  const state = { questionId: null as string | null };
  const tracker = new TurnTracker(
    () => clock,
    { onFinal: (t) => finals.push(t), onChange: () => {} },
    () => state.questionId,
  );
  return {
    tracker,
    finals,
    state,
    at(ms: number, event: Record<string, unknown>) {
      clock = ms;
      tracker.handle(event as { type: string });
    },
  };
}

test("면접관 턴은 오디오가 실제로 재생된 구간을 시각으로 쓴다", () => {
  const { at, finals } = setup();
  at(100, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "안녕" });
  at(400, { type: "output_audio_buffer.started", response_id: "r1" });
  at(900, { type: "response.output_audio_transcript.done", response_id: "r1", item_id: "i1", transcript: "안녕하세요" });
  at(1000, { type: "response.done", response: { id: "r1", status: "completed" } });
  assert.equal(finals.length, 0, "오디오가 끝나기 전에는 확정하지 않는다");
  at(3000, { type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.deepEqual(finals, [
    { role: "interviewer", text: "안녕하세요", startMs: 400, endMs: 3000, itemId: "i1", interrupted: false, questionId: null },
  ]);
});

test("음성 시작보다 생성 완료가 먼저 와도 재생 구간과 인사 단계 질문을 유지한다", () => {
  const { at, finals, state } = setup();
  at(100, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "안녕하세요" });
  at(200, { type: "response.done", response: {
    id: "r1", status: "completed", output: [{ content: [{ type: "audio" }] }],
  } });
  assert.equal(finals.length, 0);
  at(300, { type: "output_audio_buffer.started", response_id: "r1" });
  state.questionId = "q1";
  at(400, { type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.deepEqual([finals[0].startMs, finals[0].endMs, finals[0].questionId], [300, 400, null]);
});

test("지원자 전사가 늦게 도착해도 발화 시작 시각을 유지한다", () => {
  const { at, finals } = setup();
  at(5000, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(9000, { type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  at(9500, { type: "output_audio_buffer.started", response_id: "r2" });
  at(9800, { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: " 어 저는 " });
  assert.deepEqual(finals[0], {
    role: "candidate",
    text: "어 저는",
    startMs: 5000,
    endMs: 9000,
    itemId: "u1",
    interrupted: false,
    questionId: null,
  });
});

test("끼어들기로 끊긴 면접관 턴은 interrupted 표시만 붙인다", () => {
  const { at, finals } = setup();
  at(0, { type: "output_audio_buffer.started", response_id: "r1" });
  at(500, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "다음 질문은" });
  at(800, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(850, { type: "output_audio_buffer.cleared", response_id: "r1" });
  at(900, { type: "response.done", response: { id: "r1", status: "cancelled" } });
  assert.equal(finals.length, 1);
  assert.equal(finals[0].interrupted, true);
  assert.equal(finals[0].endMs, 850);
  assert.equal(finals[0].text, "다음 질문은");
});

test("빈 전사는 저장하지 않고, 전사 실패는 안내 문구로 남긴다", () => {
  const { at, finals } = setup();
  at(0, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(200, { type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  at(300, { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "  " });
  at(1000, { type: "input_audio_buffer.speech_started", item_id: "u2" });
  at(2000, { type: "input_audio_buffer.speech_stopped", item_id: "u2" });
  at(2100, { type: "conversation.item.input_audio_transcription.failed", item_id: "u2", error: {} });
  assert.equal(finals.length, 1);
  assert.match(finals[0].text, /전사 실패/);
});

test("flush는 진행 중이던 턴을 종료 시각으로 확정한다", () => {
  const { at, tracker, finals } = setup();
  at(0, { type: "output_audio_buffer.started", response_id: "r1" });
  at(100, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "마지막으로" });
  at(500, { type: "input_audio_buffer.speech_started", item_id: "u9" });
  at(700, { type: "conversation.item.input_audio_transcription.delta", item_id: "u9", delta: "감사합니다" });
  at(1200, { type: "noop" });
  tracker.flush();
  assert.equal(finals.length, 2);
  const interviewer = finals.find((f) => f.role === "interviewer")!;
  assert.equal(interviewer.interrupted, true);
  assert.equal(interviewer.endMs, 1200);
  const candidate = finals.find((f) => f.role === "candidate")!;
  assert.deepEqual([candidate.text, candidate.startMs, candidate.endMs], ["감사합니다", 500, 1200]);
});

test("liveTurns는 시작 시각 순으로 정렬된다", () => {
  const { at, tracker } = setup();
  at(2000, { type: "output_audio_buffer.started", response_id: "r1" });
  at(2100, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "네" });
  at(1000, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(1500, { type: "conversation.item.input_audio_transcription.delta", item_id: "u1", delta: "저는" });
  assert.deepEqual(
    tracker.liveTurns().map((t) => t.role),
    ["candidate", "interviewer"],
  );
});

test("응답 지연은 발화 끝 감지부터 면접관 오디오 시작까지 잰다", () => {
  const { at, tracker } = setup();
  at(1000, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(3000, { type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  at(3800, { type: "output_audio_buffer.started", response_id: "r1" });
  at(5000, { type: "output_audio_buffer.started", response_id: "r2" });
  assert.deepEqual(tracker.latencies, [800]);
});

test("지원자 턴은 말을 시작한 시점의 질문을 유지한다", () => {
  const { at, finals, state } = setup();
  state.questionId = "q1";
  at(1000, { type: "input_audio_buffer.speech_started", item_id: "u1" });
  at(4000, { type: "input_audio_buffer.speech_stopped", item_id: "u1" });
  state.questionId = "q2"; // 전사가 끝나기 전에 면접관이 다음 질문으로 넘어감
  at(4500, { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "네" });
  assert.equal(finals[0].questionId, "q1");
});

test("자기소개에서 시작한 턴은 전사가 늦어도 null 질문을 유지한다", () => {
  const { at, finals, state } = setup();
  at(1000, { type: "input_audio_buffer.speech_started", item_id: "intro" });
  at(2000, { type: "input_audio_buffer.speech_stopped", item_id: "intro" });
  state.questionId = "q1";
  at(3000, { type: "conversation.item.input_audio_transcription.completed", item_id: "intro", transcript: "자기소개" });
  assert.equal(finals[0].questionId, null);
});

test("이전 응답의 재생 종료는 후속 응답의 발언 표시를 끄지 않는다", () => {
  const { at, tracker } = setup();
  at(0, { type: "output_audio_buffer.started", response_id: "r1" });
  at(100, { type: "output_audio_buffer.started", response_id: "r2" });
  at(200, { type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(tracker.interviewerSpeaking, true);
  at(300, { type: "output_audio_buffer.stopped", response_id: "r2" });
  assert.equal(tracker.interviewerSpeaking, false);
});

test("면접관 턴은 response.done 시점의 질문을 쓴다", () => {
  const { at, finals, state } = setup();
  state.questionId = "q1";
  at(0, { type: "output_audio_buffer.started", response_id: "r1" });
  at(100, { type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "i1", delta: "다음 질문입니다" });
  at(300, { type: "response.output_audio_transcript.done", response_id: "r1", item_id: "i1", transcript: "다음 질문입니다" });
  state.questionId = "q2"; // 같은 응답의 start_question 호출을 세션이 먼저 처리했다고 가정
  at(400, { type: "response.done", response: { id: "r1", status: "completed" } });
  at(2000, { type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(finals[0].questionId, "q2");
});

test("도구 호출만 있는 응답은 턴을 만들지 않는다", () => {
  const { at, finals, tracker } = setup();
  at(0, {
    type: "response.done",
    response: { id: "r1", status: "completed", output: [{ type: "function_call", name: "start_question", call_id: "c1" }] },
  });
  assert.equal(finals.length, 0);
  assert.equal(tracker.liveTurns().length, 0);
});
