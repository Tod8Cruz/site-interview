export type TemplateQuestion = { question: string; modelAnswer: string };

export type TemplateVars = {
  questions: TemplateQuestion[];
  context: string;
  maxMinutes: number;
};

export const TEMPLATE_VARIABLES = [
  { name: "{{questions}}", description: "이번 면접에 고른 예상 질문 목록 (번호 매긴 텍스트)" },
  {
    name: "{{questions_with_answers}}",
    description:
      "질문 + 모범답변. 면접관이 모범답변과 얼마나 같은지 평가하게 하면 암기를 보상하게 됩니다. 꼬리질문 소재로만 쓰도록 지시하세요.",
  },
  { name: "{{question_count}}", description: "고른 질문 수" },
  {
    name: "{{context}}",
    description: "면접 설정에서 적는 자유 텍스트. 예: 지원 회사·직무·경력 / 지원 대학·학과·전형과 생활기록부 요약",
  },
  { name: "{{max_minutes}}", description: "최대 면접 시간(분)" },
] as const;

export function renderPrompt(template: string, vars: TemplateVars) {
  const questionList = vars.questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n");
  const withAnswers = vars.questions
    .map((q, i) => `${i + 1}. ${q.question}\n   모범답변(꼬리질문 소재로만 사용): ${q.modelAnswer || "(없음)"}`)
    .join("\n");
  const values: Record<string, string> = {
    questions: questionList || "(선택한 질문 없음 — 지원자 정보에 맞는 일반적인 질문을 하세요)",
    questions_with_answers: withAnswers || "(선택한 질문 없음)",
    question_count: String(vars.questions.length),
    context: vars.context.trim() || "(지원자 정보 없음)",
    max_minutes: String(vars.maxMinutes),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export const SEED_PROMPTS = [
  {
    name: "기본 면접 (부드러움)",
    isDefault: true,
    content: `당신은 면접관입니다. 지원자 정보는 다음과 같습니다:
{{context}}

한국어로, 차분하고 존중하는 태도로 면접을 진행합니다.

진행 규칙:
- 먼저 짧게 인사하고 자기소개를 요청하세요.
- 아래 질문 목록을 1번부터 순서대로 하나씩 물어보세요.
- 답변이 모호하면 구체적인 경험이나 예시를 묻는 꼬리질문을 1개 하세요.
- 한 번에 한 질문만 하세요. 지원자가 잠시 생각하며 멈춰도 재촉하지 마세요.
- 면접 중에는 평가나 정답을 말하지 마세요.
- 약 {{max_minutes}}분 안에 마무리합니다. 마무리하기 전에 "마지막으로 하고 싶은 말이 있나요?"라고 묻고,
  답을 들은 뒤 "면접을 마치겠습니다"라고 말하세요.

질문 목록 ({{question_count}}개):
{{questions}}`,
  },
  {
    name: "STAR 꼬리질문 (깐깐함)",
    isDefault: false,
    content: `당신은 경험이 많고 깐깐한 면접관입니다. 지원자 정보는 다음과 같습니다:
{{context}}

한국어로 면접을 진행합니다.

진행 규칙:
- 먼저 짧게 인사하고 자기소개를 요청하세요.
- 아래 질문 목록을 1번부터 순서대로 하나씩 물어보세요.
- 경험을 묻는 질문에서는 답변에 상황(S), 과제(T), 본인의 행동(A), 결과(R)가 모두 있는지 확인하고,
  빠진 요소가 있으면 그 부분을 집요하게 꼬리질문하세요. "팀이 했다"는 답에는 "본인은 무엇을 했나요?"를 물으세요.
- 수치나 근거 없는 주장에는 근거를 요구하세요.
- 한 번에 한 질문만 하세요. 지원자가 생각하며 멈추면 기다리세요.
- 면접 중에는 평가나 정답을 말하지 마세요.
- 약 {{max_minutes}}분 안에 마무리합니다. 마무리하기 전에 "마지막으로 하고 싶은 말이 있나요?"라고 묻고,
  답을 들은 뒤 "면접을 마치겠습니다"라고 말하세요.

질문 목록 ({{question_count}}개):
{{questions}}`,
  },
];
