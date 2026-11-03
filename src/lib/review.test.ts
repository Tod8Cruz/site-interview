import assert from "node:assert/strict";
import { test } from "node:test";
import { answerMetrics, similarity, suggestQuestion, transcriptMarkdown, type ReviewTurn } from "./review";

const turn = (p: Partial<ReviewTurn> & Pick<ReviewTurn, "role" | "startMs">): ReviewTurn => ({
  id: `${p.role}-${p.startMs}`,
  text: "",
  endMs: null,
  interrupted: false,
  note: null,
  noteQuestionId: null,
  questionId: null,
  ...p,
});

test("similarity: 같은 질문을 다르게 말해도 가장 높다", () => {
  const asked = "네, 그럼 우리 회사에 지원하신 동기를 말씀해 주시겠어요?";
  assert.ok(similarity(asked, "지원동기를 말씀해 주세요.") > similarity(asked, "교사가 되려는 이유는?"));
  assert.equal(similarity("", "abc"), 0);
});

test("suggestQuestion: 직전 면접관 발화와 가장 비슷한 질문을 고른다", () => {
  const questions = [
    { id: "q1", question: "지원동기를 말씀해 주세요." },
    { id: "q2", question: "학창 시절 갈등을 해결한 경험은?" },
  ];
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "학창 시절에 갈등을 해결해 본 경험이 있나요?" }),
    turn({ role: "candidate", startMs: 3000, text: "네 저는" }),
  ];
  assert.equal(suggestQuestion(turns, 1, questions), "q2");
  assert.equal(suggestQuestion([turns[1]], 0, questions), null);
  assert.equal(suggestQuestion([turn({ role: "interviewer", startMs: 0, text: "날씨가 좋네요" })], 0, questions), null);
});

test("suggestQuestion: 면접 중 기록된 질문이 유사도보다 우선한다", () => {
  const questions = [
    { id: "q1", question: "지원동기를 말씀해 주세요." },
    { id: "q2", question: "학창 시절 갈등을 해결한 경험은?" },
  ];
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "학창 시절에 갈등을 해결해 본 경험이 있나요?", questionId: "q1" }),
    turn({ role: "candidate", startMs: 3000, text: "네 저는" }),
    turn({ role: "candidate", startMs: 6000, text: "그리고", questionId: "q2" }),
  ];
  assert.equal(suggestQuestion(turns, 0, questions), "q1");
  assert.equal(suggestQuestion(turns, 1, questions), "q1", "지원자 턴은 직전 면접관 턴의 기록을 따른다");
  assert.equal(suggestQuestion(turns, 2, questions), "q1", "면접관 발화 없이 이어진 조각은 첫 답변을 따른다");
  const unknown = [turn({ role: "interviewer", startMs: 0, text: "갈등 해결 경험은?", questionId: "deleted" })];
  assert.equal(suggestQuestion(unknown, 0, questions), "q2", "목록에 없는 id면 유사도로 돌아간다");
});

test("suggestQuestion: 빈 턴은 건너뛰되 실제 면접관 발화 뒤에는 새 질문을 따른다", () => {
  const questions = [{ id: "q1", question: "지원동기?" }, { id: "q2", question: "경험?" }];
  const turns = [
    turn({ role: "candidate", startMs: 0, text: "첫 답변", questionId: "q1" }),
    turn({ role: "interviewer", startMs: 100, text: " ", questionId: "q2" }),
    turn({ role: "candidate", startMs: 200, text: "", questionId: "q2" }),
    turn({ role: "candidate", startMs: 300, text: "이어지는 답변", questionId: "q2" }),
    turn({ role: "interviewer", startMs: 400, text: "경험?", questionId: "q2" }),
    turn({ role: "candidate", startMs: 500, text: "다음 답변", questionId: "q2" }),
  ];
  assert.equal(suggestQuestion(turns, 3, questions), "q1");
  assert.equal(suggestQuestion(turns, 5, questions), "q2");
});

test("suggestQuestion: 자기소개에 이어진 조각의 잘못된 질문 번호는 사용하지 않는다", () => {
  const turns = [
    turn({ role: "candidate", startMs: 0, text: "안녕하세요" }),
    turn({ role: "candidate", startMs: 500, text: "저는", questionId: "q1" }),
  ];
  assert.equal(suggestQuestion(turns, 1, [{ id: "q1", question: "지원동기?" }]), null);
});

test("answerMetrics: 답변 길이와 첫마디까지 걸린 시간", () => {
  const turns = [
    turn({ role: "interviewer", startMs: 0, endMs: 3000 }),
    turn({ role: "candidate", startMs: 4200, endMs: 20_000 }),
    turn({ role: "candidate", startMs: 21_000, endMs: 25_000 }),
    turn({ role: "interviewer", startMs: 26_000, endMs: 28_000 }),
    turn({ role: "candidate", startMs: 27_500, endMs: 30_000 }),
  ];
  assert.deepEqual(answerMetrics(turns), [
    null,
    { durationMs: 15_800, firstWordMs: 1200 },
    { durationMs: 4000, firstWordMs: null },
    null,
    { durationMs: 2500, firstWordMs: null },
  ]);
});

test("transcriptMarkdown: 메모와 연결 질문을 포함한다", () => {
  const md = transcriptMarkdown(
    "모의면접",
    [
      turn({ role: "interviewer", startMs: 0, endMs: 2000, text: "지원동기는?" }),
      turn({ role: "candidate", startMs: 3500, endMs: 65_000, text: "어 저는", note: "군말 많음\n결론 먼저", noteQuestionId: "q1" }),
    ],
    [{ id: "q1", question: "지원동기를 말씀해 주세요." }],
  );
  assert.match(md, /\*\*나\*\* `0:04` \(답변 1:02, 첫마디 1\.5초\)/);
  assert.match(md, /> 📝 군말 많음\n> 결론 먼저\n> — 질문: 지원동기를 말씀해 주세요\./);
});
