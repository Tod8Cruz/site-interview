/**
 * 질문 API 설명서. /api-docs(HTML), /api/v1/docs·/llms.txt(마크다운)가 같은 내용을 쓴다.
 * API를 바꾸면 여기도 같이 고친다.
 */
export function apiDocsMarkdown(origin: string) {
  const base = `${origin}/api/v1`;
  return `# 모의 면접 — 예상 질문 API

면접 예상 질문과 모범 답변을 조회·추가·수정·삭제하는 REST API입니다.
AI 에이전트가 이 문서만 읽고 바로 호출할 수 있도록 작성했습니다.

- Base URL: \`${base}\`
- 이 문서(마크다운): \`${base}/docs\` · \`${origin}/llms.txt\`
- 본문과 응답은 모두 JSON(\`Content-Type: application/json\`), 문자 인코딩은 UTF-8입니다.

## 인증

모든 요청(이 문서 제외)에 API 토큰을 Bearer로 붙입니다. 토큰은 웹 앱의 **설정 > API 토큰**에서 발급합니다.

\`\`\`
Authorization: Bearer mi_xxxxxxxxxxxxxxxx
\`\`\`

토큰이 없거나 틀리거나 만료되면 \`401 unauthorized\`를 돌려줍니다.

## 데이터 모델: Question

| 필드 | 타입 | 설명 |
|------|------|------|
| \`id\` | string (uuid) | 서버가 만든다. 읽기 전용 |
| \`question\` | string, 1~1000자 | 면접 질문 (필수) |
| \`modelAnswer\` | string, 최대 20000자 | 모범 답변. 마크다운 가능. 기본값 \`""\` |
| \`category\` | string \\| null, 최대 100자 | 예: \`인성\`, \`직무\`, \`지원동기\`. 빈 문자열은 \`null\`로 저장 |
| \`tags\` | string[], 최대 20개, 각 1~50자 | 예: \`["공채", "삼성"]\`. 중복은 자동 제거 |
| \`sortOrder\` | integer | 작을수록 앞. 기본값 \`0\` |
| \`createdAt\` / \`updatedAt\` | string (ISO 8601) | 읽기 전용 |

목록은 \`sortOrder\` 오름차순, 같으면 최근에 만든 순서입니다.

## 엔드포인트

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

보낸 필드만 바뀝니다. 최소 한 필드가 필요합니다. \`tags\`는 배열 전체를 바꿉니다(추가가 아님).

\`\`\`bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  "${base}/questions/{id}" -d '{"modelAnswer":"고친 답변"}'
\`\`\`

응답 \`200\`: 수정된 Question. 없으면 \`404\`.

### DELETE /questions/{id} — 삭제

응답 \`204\` (본문 없음). 없으면 \`404\`.

### GET /categories — 쓰고 있는 카테고리 목록

응답 \`200\`: \`{ "items": ["인성", "직무", …] }\`

### GET /tags — 쓰고 있는 태그 목록

응답 \`200\`: \`{ "items": ["공채", "삼성", …] }\`

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
| 404 | \`not_found\` | 해당 id의 질문 없음 |
| 405 | — | 지원하지 않는 메서드 |
| 500 | \`internal_error\` | 서버 오류. 잠시 뒤 다시 시도 |

## AI 에이전트를 위한 안내

- 질문을 추가하기 전에 \`GET /questions?q=핵심어\`로 비슷한 질문이 이미 있는지 확인하고, 있으면 새로 만들지 말고 \`PATCH\`로 보완하세요.
- 카테고리와 태그는 자유 문자열입니다. 새로 만들기 전에 \`GET /categories\`, \`GET /tags\`로 기존 이름을 확인해 표기를 맞추세요.
- 여러 개를 넣을 때는 \`POST /questions/bulk\`를 쓰세요.
- \`modelAnswer\`는 지원자가 소리 내어 말할 답변입니다. 1분(약 300~400자) 안팎, 두괄식, 구체적 경험 위주가 좋습니다.
- 삭제는 되돌릴 수 없습니다. 사용자가 분명히 요청했을 때만 하세요.
`;
}
