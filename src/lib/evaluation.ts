// 면접 AI 평가 (PRD-v2 12절 2차 후보). 서버·클라이언트·테스트 공용 순수 함수.
import { z } from "zod";
import { suggestQuestion, type ReviewQuestion, type ReviewTurn } from "./review";

/** 평가 기준(루브릭)의 항목 하나. 루브릭에 jsonb 배열로 저장되고 평가 때 통째로 스냅샷된다. */
export type RubricCriterion = { id: string; name: string; description: string };

export type CriterionScore = { criterionId: string; score: number; comment: string };

export type AnswerEvaluation = {
  /** questionId 또는 ETC_KEY */
  key: string;
  questionId: string | null;
  questionText: string;
  /** 이 묶음에 속한 지원자 턴 id (첫 id로 다시 보기의 턴 앵커를 만든다) */
  turnIds: string[];
  /** 지원자 발화만 이어 붙인 것 */
  answerText: string;
  scores: CriterionScore[];
  strengths: string[];
  improvements: string[];
};

export type EvaluationResult = {
  answers: AnswerEvaluation[];
  overall: { scores: CriterionScore[]; summary: string; strengths: string[]; improvements: string[] };
};

export const ETC_KEY = "etc";
export const ETC_LABEL = "기타 (자기소개·목록 외 질문)";

export type AnswerGroup = {
  key: string;
  questionId: string | null;
  questionText: string;
  turnIds: string[];
  answerText: string;
  /** "면접관: …\n지원자: …" 이 묶음의 대화 (꼬리질문 포함) */
  transcript: string;
};

/**
 * 지원자 턴을 예상 질문별로 묶는다. 질문은 suggestQuestion(연속 답변의 첫 조각 → 면접 중 기록 → 직전 면접관 발화 유사도)으로 정하고,
 * 꼬리질문처럼 어느 질문인지 알 수 없는 턴은 직전 질문에 이어 붙인다. 첫 질문이 정해지기 전(인사·자기소개)은 기타로 묶는다.
 * 사이에 있던 면접관 발화는 다음 지원자 턴의 묶음 대화에 들어간다.
 */
export function groupAnswers(turns: ReviewTurn[], questions: ReviewQuestion[]): AnswerGroup[] {
  const questionById = new Map(questions.map((q) => [q.id, q.question]));
  const groups = new Map<string, AnswerGroup>();
  let current: string | null = null;
  let pendingInterviewer: string[] = [];
  turns.forEach((t, i) => {
    const text = t.text.trim();
    if (t.role === "interviewer") {
      if (text) pendingInterviewer.push(`면접관: ${text}`);
      return;
    }
    if (!text) return;
    current = suggestQuestion(turns, i, questions) ?? current;
    const key = current ?? ETC_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        questionId: current,
        questionText: current ? (questionById.get(current) ?? ETC_LABEL) : ETC_LABEL,
        turnIds: [],
        answerText: "",
        transcript: "",
      };
      groups.set(key, group);
    }
    group.turnIds.push(t.id);
    group.answerText = group.answerText ? `${group.answerText}\n${text}` : text;
    const lines = [...pendingInterviewer, `지원자: ${text}`].join("\n");
    group.transcript = group.transcript ? `${group.transcript}\n${lines}` : lines;
    pendingInterviewer = [];
  });
  return Array.from(groups.values());
}

export type EvaluationPromptInput = {
  criteria: RubricCriterion[];
  groups: AnswerGroup[];
  questions: { id: string; question: string; modelAnswer: string }[];
  /** 면접 시작 시점의 지원자 정보 스냅샷 */
  context: string;
};

const NONE = "(없음)";

/** Responses API의 instructions(역할·원칙)와 input(실제 기록)을 만든다. */
export function buildEvaluationPrompt({ criteria, groups, questions, context }: EvaluationPromptInput) {
  const instructions = [
    "당신은 한국어 모의면접 평가관입니다. 아래 면접 대화 기록을 주어진 평가 항목에 따라 채점하고, 지원자가 다음 연습에서 바로 고칠 수 있는 피드백을 씁니다.",
    "",
    "## 평가 원칙",
    "- 기록은 음성 전사입니다. 오인식된 단어와 맞춤법은 평가하지 않고, 발음·속도·목소리는 알 수 없으므로 평가하지 않습니다.",
    "- '어', '음' 같은 군말은 전사에 일부러 남겨 둔 것입니다. 자주 반복될 때만 전달력 개선점으로 한 번 짚고, 점수의 주된 근거로 삼지 마세요.",
    "- 각 평가 항목은 항목 설명을 기준으로 1~5 정수로 채점합니다. 1 매우 부족 / 2 부족 / 3 보통 / 4 우수 / 5 매우 우수.",
    "- comment는 답변 내용을 근거로 1~2문장으로 씁니다.",
    "- 모범답변은 사실 관계와 내용을 확인하는 참고 자료일 뿐입니다. 모범답변과 표현·구조·순서가 비슷하다고 점수를 올리지 말고, 다르다고 깎지 마세요. 외운 것을 읽는 듯한 답변은 오히려 전달력과 진정성 면에서 감점할 수 있습니다. 지원자의 실제 경험과 논리로만 평가하세요.",
    "- 답변 묶음마다 strengths와 improvements를 각각 1~3개 씁니다. 답변 문구를 인용해 구체적으로 쓰고, 다음 연습에서 바로 고칠 수 있게 씁니다.",
    "- overall에는 면접 전체를 본 항목별 종합 점수, 3~5문장의 총평(summary), 강점·개선점 각 2~3개를 씁니다.",
    "- answers에는 주어진 답변 묶음(key)을 빠짐없이 같은 순서로 넣고, 묶음마다 모든 평가 항목 id를 빠짐없이 채점합니다.",
    "- 주어진 JSON 형식으로만 답합니다.",
  ].join("\n");

  const modelAnswerById = new Map(questions.map((q) => [q.id, q.modelAnswer.trim()]));
  const input = [
    "## 지원자 정보",
    context.trim() || NONE,
    "",
    "## 평가 항목",
    ...criteria.map((c) => `- id: ${c.id} / 이름: ${c.name} / 설명: ${c.description.trim() || NONE}`),
    "",
    `## 답변 묶음 (${groups.length}개)`,
    ...groups.flatMap((g, i) => [
      "",
      `### [key: ${g.key}] ${i + 1}. ${g.questionText}`,
      `모범답변(참고용, 유사도 평가 금지): ${(g.questionId && modelAnswerById.get(g.questionId)) || NONE}`,
      "대화:",
      g.transcript,
    ]),
  ].join("\n");

  return { instructions, input };
}

/** OpenAI strict JSON 스키마. 모든 객체는 additionalProperties=false, 모든 속성 required. 항목 id와 묶음 key는 enum으로 고정한다. */
export function evaluationJsonSchema(criterionIds: string[], groupKeys: string[]): Record<string, unknown> {
  const strings = { type: "array", items: { type: "string" } };
  const scores = {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["criterionId", "score", "comment"],
      properties: {
        criterionId: { type: "string", enum: criterionIds },
        score: { type: "integer", minimum: 1, maximum: 5 },
        comment: { type: "string" },
      },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["answers", "overall"],
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "scores", "strengths", "improvements"],
          properties: { key: { type: "string", enum: groupKeys }, scores, strengths: strings, improvements: strings },
        },
      },
      overall: {
        type: "object",
        additionalProperties: false,
        required: ["scores", "summary", "strengths", "improvements"],
        properties: { scores, summary: { type: "string" }, strengths: strings, improvements: strings },
      },
    },
  };
}

const rawScore = z.object({
  criterionId: z.string(),
  score: z.number().transform((n) => Math.min(5, Math.max(1, Math.round(n)))),
  comment: z.string(),
});

/** 모델이 돌려준 JSON. 점수는 1~5 정수로 맞춘다. */
export const evaluationOutputSchema = z.object({
  answers: z.array(
    z.object({ key: z.string(), scores: z.array(rawScore), strengths: z.array(z.string()), improvements: z.array(z.string()) }),
  ),
  overall: z.object({
    scores: z.array(rawScore),
    summary: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  }),
});

export type RawEvaluation = z.output<typeof evaluationOutputSchema>;

const cleanList = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

function pickScores(scores: RawEvaluation["overall"]["scores"], criteria: RubricCriterion[], where: string) {
  const byId = new Map(scores.map((s) => [s.criterionId, s]));
  return criteria.map((c) => {
    const found = byId.get(c.id);
    if (!found) throw new Error(`${where}에 '${c.name}' 항목 점수가 없습니다.`);
    return { criterionId: c.id, score: found.score, comment: found.comment.trim() };
  });
}

/**
 * 모델 출력을 저장 형식으로 바꾼다. 묶음 순서와 항목 순서는 우리 쪽(groups, criteria)을 따르고,
 * 모르는 항목 id는 버리며, 빠진 묶음·항목이 있으면 예외를 던진다.
 */
export function normalizeEvaluation(raw: RawEvaluation, criteria: RubricCriterion[], groups: AnswerGroup[]): EvaluationResult {
  const byKey = new Map(raw.answers.map((a) => [a.key, a]));
  const answers = groups.map((g, i) => {
    const found = byKey.get(g.key);
    if (!found) throw new Error(`답변 묶음 ${i + 1}의 평가가 없습니다.`);
    return {
      key: g.key,
      questionId: g.questionId,
      questionText: g.questionText,
      turnIds: g.turnIds,
      answerText: g.answerText,
      scores: pickScores(found.scores, criteria, `답변 ${i + 1}`),
      strengths: cleanList(found.strengths),
      improvements: cleanList(found.improvements),
    };
  });
  return {
    answers,
    overall: {
      scores: pickScores(raw.overall.scores, criteria, "종합"),
      summary: raw.overall.summary.trim(),
      strengths: cleanList(raw.overall.strengths),
      improvements: cleanList(raw.overall.improvements),
    },
  };
}

/** 항목별 답변 점수 평균(소수 1자리). 답변이 없으면 null. */
export function criterionAverages(result: EvaluationResult, criteria: RubricCriterion[]) {
  return criteria.map((c) => {
    const scores = result.answers.flatMap((a) => a.scores.filter((s) => s.criterionId === c.id).map((s) => s.score));
    const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    return { criterionId: c.id, average };
  });
}

/** 루브릭이 하나도 없을 때 넣는 시드. id는 저장할 때 붙인다. */
export const SEED_RUBRICS: { name: string; isDefault: boolean; criteria: Omit<RubricCriterion, "id">[] }[] = [
  {
    name: "기본 평가 기준",
    isDefault: true,
    criteria: [
      { name: "질문 이해", description: "질문의 의도를 정확히 파악하고 묻는 것에 답했는가. 동문서답이나 질문 일부만 답하지 않았는가." },
      { name: "구조와 논리", description: "결론을 먼저 말하고 근거가 이어지는가. 경험 답변은 상황·과제·행동·결과(STAR)가 드러나는가." },
      { name: "구체성과 근거", description: "추상적인 주장 대신 실제 경험, 수치, 사례로 뒷받침했는가." },
      { name: "직무·조직 적합성", description: "답변이 지원 직무와 조직에서 필요한 역량·태도와 연결되는가. 지원자 정보와 일관되는가." },
      { name: "전달력", description: "핵심이 분명하고 군더더기 없이 적절한 길이로 말했는가. 전사 기준이므로 발음·속도는 보지 않는다." },
    ],
  },
];
