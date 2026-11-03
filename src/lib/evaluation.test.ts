import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEvaluationPrompt,
  criterionAverages,
  ETC_KEY,
  ETC_LABEL,
  evaluationJsonSchema,
  evaluationOutputSchema,
  groupAnswers,
  normalizeEvaluation,
  type AnswerGroup,
  type EvaluationResult,
  type RubricCriterion,
} from "./evaluation";
import type { ReviewTurn } from "./review";

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

const questions = [
  { id: "q1", question: "지원동기를 말씀해 주세요." },
  { id: "q2", question: "학창 시절 갈등을 해결한 경험은?" },
];

const criteria: RubricCriterion[] = [
  { id: "c1", name: "질문 이해", description: "묻는 것에 답했는가" },
  { id: "c2", name: "구체성", description: "" },
];

test("groupAnswers: 기록된 질문별로 지원자 턴을 묶고 등장 순서를 지킨다", () => {
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "지원동기를 말씀해 주세요.", questionId: "q1" }),
    turn({ role: "candidate", startMs: 1000, text: "첫째 이유는" }),
    turn({ role: "candidate", startMs: 2000, text: "둘째 이유는" }),
    turn({ role: "interviewer", startMs: 3000, text: "갈등 해결 경험은?", questionId: "q2" }),
    turn({ role: "candidate", startMs: 4000, text: "동아리에서" }),
  ];
  const groups = groupAnswers(turns, questions);
  assert.deepEqual(
    groups.map((g) => [g.key, g.questionId, g.questionText, g.turnIds, g.answerText]),
    [
      ["q1", "q1", "지원동기를 말씀해 주세요.", ["candidate-1000", "candidate-2000"], "첫째 이유는\n둘째 이유는"],
      ["q2", "q2", "학창 시절 갈등을 해결한 경험은?", ["candidate-4000"], "동아리에서"],
    ],
  );
  assert.equal(groups[0].transcript, "면접관: 지원동기를 말씀해 주세요.\n지원자: 첫째 이유는\n지원자: 둘째 이유는");
});

test("groupAnswers: 첫 질문 전 답변(자기소개)은 기타로 묶는다", () => {
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "안녕하세요. 자기소개 부탁드립니다." }),
    turn({ role: "candidate", startMs: 1000, text: "안녕하세요 저는" }),
    turn({ role: "interviewer", startMs: 2000, text: "지원동기를 말씀해 주세요.", questionId: "q1" }),
    turn({ role: "candidate", startMs: 3000, text: "이유는" }),
  ];
  const groups = groupAnswers(turns, questions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, ETC_KEY);
  assert.equal(groups[0].questionId, null);
  assert.equal(groups[0].questionText, ETC_LABEL);
  assert.equal(groups[1].key, "q1");
});

test("groupAnswers: 꼬리질문 답변은 직전 질문 묶음에 이어 붙는다", () => {
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "지원동기를 말씀해 주세요.", questionId: "q1" }),
    turn({ role: "candidate", startMs: 1000, text: "이유는" }),
    turn({ role: "interviewer", startMs: 2000, text: "좀 더 구체적인 예를 들어 주시겠어요?" }),
    turn({ role: "candidate", startMs: 3000, text: "예를 들면" }),
  ];
  const groups = groupAnswers(turns, questions);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].turnIds, ["candidate-1000", "candidate-3000"]);
  assert.match(groups[0].transcript, /면접관: 좀 더 구체적인 예를 들어 주시겠어요\?\n지원자: 예를 들면/);
});

test("groupAnswers: 빈 지원자 턴은 건너뛰고 질문 목록이 없으면 전부 기타다", () => {
  const turns = [
    turn({ role: "interviewer", startMs: 0, text: "지원동기를 말씀해 주세요.", questionId: "q1" }),
    turn({ role: "candidate", startMs: 1000, text: "   " }),
    turn({ role: "candidate", startMs: 2000, text: "이유는" }),
  ];
  const groups = groupAnswers(turns, []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, ETC_KEY);
  assert.deepEqual(groups[0].turnIds, ["candidate-2000"]);
  assert.deepEqual(groupAnswers([turn({ role: "candidate", startMs: 0, text: "" })], questions), []);
});

test("buildEvaluationPrompt: 모범답변 유사도를 보상하지 말라는 지시와 항목·질문·모범답변을 담는다", () => {
  const groups: AnswerGroup[] = [
    { key: "q1", questionId: "q1", questionText: "지원동기를 말씀해 주세요.", turnIds: ["t1"], answerText: "이유는", transcript: "면접관: 지원동기?\n지원자: 이유는" },
    { key: ETC_KEY, questionId: null, questionText: ETC_LABEL, turnIds: ["t2"], answerText: "저는", transcript: "지원자: 저는" },
  ];
  const { instructions, input } = buildEvaluationPrompt({
    criteria,
    groups,
    questions: [{ id: "q1", question: "지원동기를 말씀해 주세요.", modelAnswer: "" }],
    context: "3년차 백엔드 개발자",
  });
  assert.match(instructions, /모범답변.*비슷하다고 점수를 올리지/);
  assert.match(input, /- id: c1 \/ 이름: 질문 이해 \/ 설명: 묻는 것에 답했는가/);
  assert.match(input, /- id: c2 \/ 이름: 구체성 \/ 설명: \(없음\)/);
  assert.match(input, /### \[key: q1\] 1\. 지원동기를 말씀해 주세요\.\n모범답변\(참고용, 유사도 평가 금지\): \(없음\)\n대화:\n면접관: 지원동기\?/);
  assert.match(input, /### \[key: etc\] 2\. 기타/);
  assert.match(input, /## 지원자 정보\n3년차 백엔드 개발자/);
});

test("evaluationJsonSchema: 모든 객체가 additionalProperties=false이고 모든 속성이 required다", () => {
  const schema = evaluationJsonSchema(["c1", "c2"], ["q1", "etc"]);
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object") {
      assert.equal(n.additionalProperties, false, `${path}: additionalProperties`);
      assert.deepEqual(Object.keys(n.properties as object).sort(), [...(n.required as string[])].sort(), `${path}: required`);
      for (const [key, child] of Object.entries(n.properties as object)) walk(child, `${path}.${key}`);
    }
    if (n.type === "array") walk(n.items, `${path}[]`);
  };
  walk(schema, "$");
  const json = JSON.stringify(schema);
  assert.match(json, /"enum":\["c1","c2"\]/);
  assert.match(json, /"enum":\["q1","etc"\]/);
});

test("evaluationOutputSchema: 점수를 1~5 정수로 자른다", () => {
  const parsed = evaluationOutputSchema.parse({
    answers: [{ key: "q1", scores: [{ criterionId: "c1", score: 0, comment: "" }, { criterionId: "c2", score: 7, comment: "" }], strengths: [], improvements: [] }],
    overall: { scores: [{ criterionId: "c1", score: 3.6, comment: "" }], summary: "", strengths: [], improvements: [] },
  });
  assert.deepEqual(parsed.answers[0].scores.map((s) => s.score), [1, 5]);
  assert.equal(parsed.overall.scores[0].score, 4);
});

const group = (key: string, questionId: string | null): AnswerGroup => ({
  key,
  questionId,
  questionText: questionId ? "질문" : ETC_LABEL,
  turnIds: [`t-${key}`],
  answerText: "답변",
  transcript: "지원자: 답변",
});

test("normalizeEvaluation: 루브릭 순서로 정렬하고 모르는 항목은 버리며 빠진 항목이면 예외", () => {
  const scores = [
    { criterionId: "zzz", score: 5, comment: "모르는 항목" },
    { criterionId: "c2", score: 4, comment: " 구체적 " },
    { criterionId: "c1", score: 2, comment: "" },
  ];
  const raw = {
    answers: [
      { key: ETC_KEY, scores, strengths: [" 인사 ", ""], improvements: [] },
      { key: "q1", scores, strengths: [], improvements: ["결론 먼저"] },
    ],
    overall: { scores, summary: " 총평 ", strengths: ["a"], improvements: ["b"] },
  };
  const groups = [group("q1", "q1"), group(ETC_KEY, null)];
  const result = normalizeEvaluation(raw, criteria, groups);
  assert.deepEqual(result.answers.map((a) => a.key), ["q1", ETC_KEY], "묶음 순서는 groups를 따른다");
  assert.deepEqual(result.answers[0].scores, [
    { criterionId: "c1", score: 2, comment: "" },
    { criterionId: "c2", score: 4, comment: "구체적" },
  ]);
  assert.deepEqual(result.answers[0].turnIds, ["t-q1"]);
  assert.deepEqual(result.answers[1].strengths, ["인사"]);
  assert.equal(result.overall.summary, "총평");
  assert.throws(
    () => normalizeEvaluation({ ...raw, overall: { ...raw.overall, scores: scores.slice(0, 2) } }, criteria, groups),
    /종합에 '질문 이해' 항목 점수가 없습니다/,
  );
  assert.throws(() => normalizeEvaluation(raw, criteria, [...groups, group("q2", "q2")]), /답변 묶음 3의 평가가 없습니다/);
});

test("criterionAverages: 답변별 점수 평균(소수 1자리), 답변이 없으면 null", () => {
  const score = (criterionId: string, score: number) => ({ criterionId, score, comment: "" });
  const result: EvaluationResult = {
    answers: [
      { ...group("q1", "q1"), scores: [score("c1", 4), score("c2", 2)], strengths: [], improvements: [] },
      { ...group("q2", "q2"), scores: [score("c1", 5), score("c2", 2)], strengths: [], improvements: [] },
      { ...group(ETC_KEY, null), scores: [score("c1", 5)], strengths: [], improvements: [] },
    ],
    overall: { scores: [], summary: "", strengths: [], improvements: [] },
  };
  assert.deepEqual(criterionAverages(result, criteria), [
    { criterionId: "c1", average: 4.7 },
    { criterionId: "c2", average: 2 },
  ]);
  assert.deepEqual(criterionAverages({ ...result, answers: [] }, criteria), [
    { criterionId: "c1", average: null },
    { criterionId: "c2", average: null },
  ]);
});
