/**
 * 공개 API 설명서. /api-docs(HTML), /api/v1/docs·/llms.txt(마크다운)가 같은 내용을 쓴다.
 * API를 바꾸면 여기도 같이 고친다.
 */
import { headingSlug } from "./slug";

/** 문서 안 제목으로 가는 링크. 제목 텍스트는 아래 본문의 제목과 글자 그대로 같아야 한다. */
const a = (heading: string, label = heading) => `[${label}](#${headingSlug(heading)})`;

export function apiDocsMarkdown(origin: string) {
  const base = `${origin}/api/v1`;
  return `# 모의 면접 — API 문서

예상 질문(모범 답변), 면접관 프롬프트, 평가 기준을 조회·추가·수정·삭제하는 REST API입니다.
AI 에이전트가 이 문서만 읽고 바로 호출할 수 있도록 작성했습니다.

- Base URL: \`${base}\`
- 이 문서(마크다운): \`${base}/docs\` · \`${origin}/llms.txt\`
- 본문과 응답은 모두 JSON(\`Content-Type: application/json\`), 문자 인코딩은 UTF-8입니다.

## 목차

- ${a("인증")} · ${a("공통 규칙")} · ${a("오류")} · ${a("AI 에이전트를 위한 안내")}
- ${a("예상 질문")} — 면접에서 물을 질문과 모범 답변
  - ${a("데이터 모델: Question", "Question 모델")}
  - ${a("GET /questions — 목록·검색", "GET /questions")} · ${a("GET /questions/{id} — 하나 조회", "GET /questions/{id}")} · ${a("POST /questions — 하나 추가", "POST /questions")} · ${a("POST /questions/bulk — 여러 개 한꺼번에 추가", "POST /questions/bulk")} · ${a("PATCH /questions/{id} — 일부 수정", "PATCH /questions/{id}")} · ${a("DELETE /questions/{id} — 삭제", "DELETE /questions/{id}")}
  - ${a("GET /categories — 쓰고 있는 카테고리 목록", "GET /categories")} · ${a("GET /tags — 쓰고 있는 태그 목록", "GET /tags")}
- ${a("프롬프트 (면접관 설정)", "프롬프트")} — 면접관의 성격·진행 규칙과 목소리·시간·말 차례 설정
  - ${a("데이터 모델: Prompt", "Prompt 모델")}
  - ${a("GET /prompts — 목록", "GET /prompts")} · ${a("GET /prompts/{id} — 하나 조회", "GET /prompts/{id}")} · ${a("POST /prompts — 추가", "POST /prompts")} · ${a("PATCH /prompts/{id} — 일부 수정", "PATCH /prompts/{id}")} · ${a("DELETE /prompts/{id} — 삭제", "DELETE /prompts/{id}")}
  - ${a("GET /voices — 쓸 수 있는 목소리 목록", "GET /voices")}
- ${a("평가 기준 (루브릭)", "평가 기준")} — 끝난 면접을 AI가 채점할 때 쓰는 항목 묶음
  - ${a("데이터 모델: Rubric", "Rubric 모델")}
  - ${a("GET /rubrics — 목록", "GET /rubrics")} · ${a("GET /rubrics/{id} — 하나 조회", "GET /rubrics/{id}")} · ${a("POST /rubrics — 추가", "POST /rubrics")} · ${a("PATCH /rubrics/{id} — 일부 수정", "PATCH /rubrics/{id}")} · ${a("DELETE /rubrics/{id} — 삭제", "DELETE /rubrics/{id}")}

## 인증

모든 요청(이 문서 제외)에 API 토큰을 Bearer로 붙입니다. 토큰은 웹 앱의 **설정 > API 토큰**에서 발급하며, 토큰을 발급한 계정의 데이터만 읽고 씁니다.

\`\`\`
Authorization: Bearer mi_xxxxxxxxxxxxxxxx
\`\`\`

토큰이 없거나 틀리거나 만료되면 \`401 unauthorized\`를 돌려줍니다.

## 공통 규칙

- \`id\`, \`createdAt\`, \`updatedAt\`은 서버가 만드는 읽기 전용 필드입니다.
- \`PATCH\`는 보낸 필드만 바꿉니다. 최소 한 필드가 필요합니다. 배열 필드(\`tags\`, \`criteria\`)는 배열 전체를 바꿉니다(추가가 아님).
- \`DELETE\`는 \`204\`(본문 없음)를 돌려주고 되돌릴 수 없습니다.
- 없는 id, 다른 계정의 id, uuid가 아닌 값은 모두 \`404 not_found\`입니다.
- 프롬프트와 평가 기준은 계정마다 **기본값이 하나** 있습니다. \`isDefault: true\`를 보내면 그것이 기본값이 되고 기존 기본값은 해제됩니다. \`false\`는 보낼 수 없습니다(해제하려면 다른 것을 기본값으로). 기본값을 지우면 남은 것 중 가장 오래된 것이 기본값이 됩니다.

---

# 예상 질문

## 데이터 모델: Question

| 필드 | 타입 | 설명 |
|------|------|------|
| \`id\` | string (uuid) | 읽기 전용 |
| \`question\` | string, 1~1000자 | 면접 질문 (필수) |
| \`modelAnswer\` | string, 최대 20000자 | 모범 답변. 마크다운 가능. 기본값 \`""\` |
| \`category\` | string \\| null, 최대 100자 | 예: \`인성\`, \`직무\`, \`지원동기\`. 빈 문자열은 \`null\`로 저장 |
| \`tags\` | string[], 최대 20개, 각 1~50자 | 예: \`["공채", "삼성"]\`. 중복은 자동 제거 |
| \`sortOrder\` | integer | 작을수록 앞. 기본값 \`0\` |
| \`createdAt\` / \`updatedAt\` | string (ISO 8601) | 읽기 전용 |

목록은 \`sortOrder\` 오름차순, 같으면 최근에 만든 순서입니다.

### GET /questions — 목록·검색

쿼리 파라미터 (모두 선택):

| 이름 | 설명 |
|------|------|
| \`q\` | 질문과 모범 답변에서 부분 일치 검색 (대소문자 무시) |
| \`category\` | 카테고리 정확히 일치 |
| \`tag\` | 이 태그를 가진 질문 |
| \`limit\` | 1~200, 기본 50 |
| \`offset\` | 0 이상, 기본 0 |

\`\`\`bash
curl -H "Authorization: Bearer $TOKEN" "${base}/questions?q=지원동기&limit=20"
\`\`\`

응답 \`200\`:

\`\`\`json
{
  "items": [
    {
      "id": "3f1c…",
      "question": "우리 회사에 지원한 동기는 무엇인가요?",
      "modelAnswer": "…",
      "category": "지원동기",
      "tags": ["공채"],
      "sortOrder": 0,
      "createdAt": "2026-10-06T05:00:00.000Z",
      "updatedAt": "2026-10-06T05:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
\`\`\`

\`total\`은 필터에 맞는 전체 개수입니다. \`offset + items.length < total\`이면 다음 페이지가 있습니다.

### GET /questions/{id} — 하나 조회

응답 \`200\`: Question. 없으면 \`404 not_found\`.

### POST /questions — 하나 추가

\`\`\`bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/questions" \\
  -d '{"question":"본인의 강점은?","modelAnswer":"…","category":"인성","tags":["공채"]}'
\`\`\`

응답 \`201\`: 만든 Question.

### POST /questions/bulk — 여러 개 한꺼번에 추가

한 번에 최대 100개. 하나라도 검증에 실패하면 아무것도 저장하지 않습니다.

\`\`\`bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/questions/bulk" \\
  -d '{"items":[{"question":"1분 자기소개 해 주세요.","category":"인성"},{"question":"입사 후 포부는?","category":"지원동기"}]}'
\`\`\`

응답 \`201\`: \`{ "items": [Question, …] }\` (보낸 순서대로)

검증 오류 메시지의 경로는 \`items.1.question\`처럼 몇 번째 항목인지 알려 줍니다.

### PATCH /questions/{id} — 일부 수정

\`\`\`bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/questions/{id}" -d '{"modelAnswer":"고친 답변"}'
\`\`\`

응답 \`200\`: 수정된 Question. 없으면 \`404\`.

### DELETE /questions/{id} — 삭제

응답 \`204\`. 없으면 \`404\`.

### GET /categories — 쓰고 있는 카테고리 목록

응답 \`200\`: \`{ "items": ["인성", "직무", …] }\`

### GET /tags — 쓰고 있는 태그 목록

응답 \`200\`: \`{ "items": ["공채", "삼성", …] }\`

---

# 프롬프트 (면접관 설정)

면접을 시작할 때 고르는 면접관 설정입니다. 면접관의 성격·진행 규칙을 적은 지시문(\`content\`)과 목소리·최대 시간·말 차례 판단 방식을 함께 저장합니다.

## 데이터 모델: Prompt

| 필드 | 타입 | 설명 |
|------|------|------|
| \`id\` | string (uuid) | 읽기 전용 |
| \`name\` | string, 1~100자 | 이름 (필수). 예: \`STAR 꼬리질문 (깐깐함)\` |
| \`content\` | string, 1~20000자 | 면접관 지시문 (필수). 아래 템플릿 변수를 쓸 수 있음 |
| \`voice\` | string | 면접관 목소리. \`GET /voices\`의 id 중 하나. 기본값 \`marin\` |
| \`maxMinutes\` | integer, 1~60 | 최대 면접 시간(분). 기본값 \`20\` |
| \`turnDetection\` | \`"semantic_vad"\` \\| \`"server_vad"\` | 말 차례 판단 방식. \`semantic_vad\`는 말의 의미로 끝남을 판단, \`server_vad\`는 침묵 길이로 판단. 기본값 \`semantic_vad\` |
| \`vadEagerness\` | \`"low"\` \\| \`"medium"\` \\| \`"high"\` \\| \`"auto"\` | \`semantic_vad\`일 때 기다림 정도. \`low\`가 가장 오래 기다림(끊어 말하는 지원자에게 유리). 기본값 \`low\` |
| \`silenceMs\` | integer, 200~5000 | \`server_vad\`일 때 답변이 끝났다고 보는 침묵 길이(ms). 기본값 \`1500\` |
| \`isDefault\` | boolean | 기본 프롬프트인지. 쓰기는 \`true\`만 가능(공통 규칙 참고) |
| \`createdAt\` / \`updatedAt\` | string (ISO 8601) | 읽기 전용 |

\`content\`에서 쓸 수 있는 템플릿 변수 (면접 시작 때 실제 값으로 바뀜):

| 변수 | 뜻 |
|------|----|
| \`{{context}}\` | 지원자 정보(지원 회사·직무·경력 등). 면접 시작 때 고른 지원자 프로필 |
| \`{{questions}}\` | 이번 면접에 고른 예상 질문 목록 (번호 매긴 텍스트) |
| \`{{questions_with_answers}}\` | 질문 + 모범답변. 모범답변과 같은지 평가하게 하면 암기를 보상하게 되므로 꼬리질문 소재로만 쓰도록 지시 |
| \`{{question_count}}\` | 고른 질문 수 |
| \`{{max_minutes}}\` | 최대 면접 시간(분) |

목록은 기본값이 먼저, 그다음 만든 순서입니다.

### GET /prompts — 목록

응답 \`200\`: \`{ "items": [Prompt, …] }\`. 프롬프트가 하나도 없는 계정이면 기본 시드 2개(부드러움 / STAR 깐깐함)가 먼저 만들어집니다.

### GET /prompts/{id} — 하나 조회

응답 \`200\`: Prompt. 없으면 \`404\`.

### POST /prompts — 추가

\`name\`과 \`content\`만 필수입니다. 나머지는 기본값이 들어갑니다.

\`\`\`bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/prompts" \\
  -d '{"name":"압박 면접","content":"당신은 면접관입니다. 지원자 정보:\\n{{context}}\\n\\n아래 질문을 순서대로 묻고, 답변마다 근거를 파고드는 꼬리질문을 하세요.\\n{{questions}}","voice":"cedar","maxMinutes":15}'
\`\`\`

응답 \`201\`: 만든 Prompt. 계정의 첫 프롬프트는 자동으로 기본값이 됩니다.

### PATCH /prompts/{id} — 일부 수정

\`\`\`bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/prompts/{id}" -d '{"maxMinutes":30,"isDefault":true}'
\`\`\`

응답 \`200\`: 수정된 Prompt. 없으면 \`404\`.

### DELETE /prompts/{id} — 삭제

응답 \`204\`. 없으면 \`404\`. 이미 진행한 면접은 시작 시점의 설정을 따로 저장해 두므로 영향이 없습니다.

### GET /voices — 쓸 수 있는 목소리 목록

응답 \`200\`:

\`\`\`json
{
  "items": [
    { "id": "marin", "gender": "female", "trait": "밝은", "recommended": true },
    { "id": "cedar", "gender": "male", "trait": "따뜻한 중음역", "recommended": true },
    { "id": "alloy", "gender": "female", "trait": "중립적이고 균형 잡힌", "recommended": false }
  ]
}
\`\`\`

\`gender\`와 \`trait\`는 참고용입니다(OpenAI 공식 정보가 아님). 특별한 요청이 없으면 \`recommended: true\`인 목소리를 쓰세요.

---

# 평가 기준 (루브릭)

끝난 면접의 대화 기록을 AI가 채점할 때 쓰는 항목 묶음입니다. 항목마다 1~5점과 코멘트가 매겨집니다. 이미 저장된 평가 결과는 그때의 기준을 스냅샷으로 들고 있어 기준을 바꾸거나 지워도 바뀌지 않습니다.

## 데이터 모델: Rubric

| 필드 | 타입 | 설명 |
|------|------|------|
| \`id\` | string (uuid) | 읽기 전용 |
| \`name\` | string, 1~100자 | 이름 (필수). 예: \`기본 평가 기준\` |
| \`criteria\` | Criterion[], 1~20개 | 평가 항목 (필수) |
| \`isDefault\` | boolean | 기본 평가 기준인지. 쓰기는 \`true\`만 가능(공통 규칙 참고) |
| \`createdAt\` / \`updatedAt\` | string (ISO 8601) | 읽기 전용 |

Criterion:

| 필드 | 타입 | 설명 |
|------|------|------|
| \`id\` | string (uuid) | 생략하면 서버가 만든다. \`PATCH\`로 항목을 고칠 때 기존 id를 그대로 보내면 같은 항목으로 유지됨 |
| \`name\` | string, 1~100자 | 항목 이름 (필수). 예: \`구조와 논리\` |
| \`description\` | string, 최대 1000자 | 무엇을 보고 점수를 매길지. 채점 AI가 그대로 읽으므로 구체적으로. 기본값 \`""\` |

목록은 기본값이 먼저, 그다음 만든 순서입니다.

### GET /rubrics — 목록

응답 \`200\`: \`{ "items": [Rubric, …] }\`. 평가 기준이 하나도 없는 계정이면 기본 시드가 먼저 만들어집니다.

### GET /rubrics/{id} — 하나 조회

응답 \`200\`: Rubric. 없으면 \`404\`.

### POST /rubrics — 추가

\`\`\`bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/rubrics" \\
  -d '{"name":"개발 직무 면접","criteria":[{"name":"기술 깊이","description":"사용한 기술의 동작 원리와 선택 이유를 설명하는가."},{"name":"문제 해결","description":"문제를 정의하고 대안을 비교한 뒤 결정한 과정이 드러나는가."}]}'
\`\`\`

응답 \`201\`: 만든 Rubric(각 항목에 \`id\`가 붙어 있음). 계정의 첫 평가 기준은 자동으로 기본값이 됩니다.

### PATCH /rubrics/{id} — 일부 수정

\`criteria\`를 보내면 배열 전체가 바뀝니다. 항목 하나만 고치려면 \`GET\`으로 받은 배열을 수정해 전부 다시 보내세요.

\`\`\`bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/rubrics/{id}" -d '{"name":"개발 직무 면접 v2","isDefault":true}'
\`\`\`

응답 \`200\`: 수정된 Rubric. 없으면 \`404\`.

### DELETE /rubrics/{id} — 삭제

응답 \`204\`. 없으면 \`404\`.

---

## 오류

오류 응답은 모두 같은 형식입니다.

\`\`\`json
{ "error": { "code": "validation_error", "message": "question: 질문을 입력하세요." } }
\`\`\`

| HTTP | code | 뜻 |
|------|------|----|
| 400 | \`validation_error\` | 필드 값이 규칙에 맞지 않음. \`message\`에 필드 경로와 이유 |
| 400 | \`bad_request\` | 본문이 올바른 JSON이 아님 |
| 401 | \`unauthorized\` | 토큰 없음·틀림·만료 |
| 404 | \`not_found\` | 해당 id의 리소스 없음 |
| 405 | — | 지원하지 않는 메서드 |
| 500 | \`internal_error\` | 서버 오류. 잠시 뒤 다시 시도 |

## AI 에이전트를 위한 안내

- 질문을 추가하기 전에 \`GET /questions?q=핵심어\`로 비슷한 질문이 이미 있는지 확인하고, 있으면 새로 만들지 말고 \`PATCH\`로 보완하세요.
- 카테고리와 태그는 자유 문자열입니다. 새로 만들기 전에 \`GET /categories\`, \`GET /tags\`로 기존 이름을 확인해 표기를 맞추세요.
- 여러 질문을 넣을 때는 \`POST /questions/bulk\`를 쓰세요.
- \`modelAnswer\`는 지원자가 소리 내어 말할 답변입니다. 1분(약 300~400자) 안팎, 두괄식, 구체적 경험 위주가 좋습니다.
- 프롬프트를 만들 때는 먼저 \`GET /prompts\`로 기존 시드의 \`content\`를 읽어 형식(인사 → 질문 순서 → 꼬리질문 규칙 → 마무리)을 참고하세요. \`{{context}}\`와 \`{{questions}}\`는 꼭 넣으세요. 음성 대화이므로 짧게 묻고, 한 번에 한 질문만 하도록 지시하세요.
- 평가 기준의 \`description\`은 채점 AI가 그대로 읽습니다. "~했는가" 형태의 판단 질문으로, 무엇이 높은 점수인지 드러나게 쓰세요. 모범답변과 얼마나 같은지는 보상하지 않는 것이 이 서비스의 원칙입니다.
- 기본값(\`isDefault\`)을 바꾸면 사용자가 다음 면접·평가에서 처음 보는 선택지가 바뀝니다. 사용자가 요청했을 때만 바꾸세요.
- 삭제는 되돌릴 수 없습니다. 사용자가 분명히 요청했을 때만 하세요.
`;
}
