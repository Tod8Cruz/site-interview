# 모의 면접 (web)

`docs/PRD-검토-20261005-1943/PRD-v2.md` 기준 구현. 현재 범위는 **M1~M6** (1차 전체):

| 단계 | 내용 |
|------|------|
| M1 | Next.js 16 + Drizzle/Postgres 스키마, 비밀번호 로그인(`proxy.ts`) |
| M2 | 예상 질문 UI(검색·필터·답변 가리기) + 질문 API(`/api/v1/questions`, `/api/v1/categories`) |
| M3 | 프롬프트 여러 개 저장·기본값·턴 감지 설정, 시드 2개(부드러움 / STAR 깐깐함) |
| M4 | Realtime 음성 면접(WebRTC), 턴 저장(단일 시계), 혼합 녹음 + IndexedDB 조각 보존, webm 탐색 보정, 1분 전 마무리 지시·시간 초과 종료, 응답 지연·사용량 계측 |
| M5 | 다시 보기: 턴 클릭 이동, 턴별 메모(자동 저장)와 연결 질문 추천, 답변 길이·첫마디까지 걸린 시간, 재면접(전체/메모한 질문만), 기록 복사·마크다운 받기, 제목 수정, 미업로드 녹음 자동 복구 |
| 추가 | 설정 > 지원자 정보 프로필(여러 개, 기본값). 면접 시작은 목록 화면의 모달에서 프로필·면접관·질문·목소리·시간을 고른다. 재면접 링크는 `/interviews?start=1&from={id}[&only=noted]` |
| 추가 | 질문 API 토큰 발급·폐기(설정 > API 토큰, 해시만 저장), 로그인 없이 열리는 API 문서(`/api-docs`, AI용 마크다운 `/api/v1/docs`·`/llms.txt`), 일괄 추가(`POST /api/v1/questions/bulk`), 태그 목록(`/api/v1/tags`) |
| M6 | 서버 쪽 비용 상한(최대 시간+2분 hangup, 종료 시 hangup, 살아 있는 통화 재접속 거부), cron 가드, 방치 면접 정리, 연결 끊김 안내, 오류·404·로딩 화면, 삭제 시 Blob 정리 |
| 추가 | 면접 일시정지·재개(R-10): 통화를 끝내고 누적 시간·질문 번호·녹음 구간을 저장, 이어하기 때 새 통화에 이전 대화를 주입. 연결 끊김도 일시정지로 처리 |
| 추가 | AI 평가(PRD 12절 2차 후보): 끝난 면접의 대화 기록을 **평가 기준**(여러 세트, 기본값 하나, 항목 편집 가능)으로 OpenAI가 채점. 질문별 항목 점수(1~5)·코멘트·강점·개선점 + 면접 전체 총평. 모범답변 유사도는 보상하지 않도록 지시. 면접당 결과 하나(다시 평가하면 덮어씀), 기준은 스냅샷 |

## 로컬 실행

```bash
docker run -d --name interview-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=interview -p 54329:5432 postgres:17-alpine
cp .env.example .env.local   # 값 채우기 (DATABASE_URL=postgres://postgres:postgres@localhost:54329/interview)
npm install
npm run db:migrate
npm run dev
```

- `DATABASE_URL` 호스트가 `localhost`면 node-postgres, 그 외(Neon)는 `@neondatabase/serverless` 드라이버를 쓴다.
- 프롬프트 시드는 `/prompts`나 `/interviews/new`를 처음 열 때 들어간다.
- `BLOB_READ_WRITE_TOKEN`이 없으면 녹음 업로드가 503으로 실패하고, 녹음은 브라우저(IndexedDB)에 남는다. 다시 보기 화면에서 로컬 녹음으로 재생·내려받기가 된다.
- OpenAI API 키는 **설정 > OpenAI API 키**에서 등록한다(DB에 AES-256-GCM으로 암호화 저장, 암호화 키는 `SESSION_SECRET`에서 파생). 환경변수 `OPENAI_API_KEY`는 등록된 키가 없을 때만 쓴다. `SESSION_SECRET`을 바꾸면 키를 다시 등록해야 한다.
- `OPENAI_BASE_URL`은 테스트용 목 서버를 가리킬 때만 쓴다.

## 배포 (Vercel + Neon)

1. Neon 프로젝트를 만들고 `DATABASE_URL`을 받은 뒤 `npm run db:migrate`.
2. Vercel 프로젝트 루트를 `web/`으로 설정하고 Blob 스토어를 연결(`BLOB_READ_WRITE_TOKEN` 자동 주입).
3. 환경변수: `DATABASE_URL`, `OPENAI_REALTIME_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `QUESTIONS_API_KEY`(선택), `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`. (`OPENAI_API_KEY`는 선택: 설정 화면에서 등록한 키가 우선)
4. OpenAI에서 이 앱 전용 프로젝트를 만들고 월 예산 한도를 건 뒤(PRD 10절), 그 키를 **설정 > OpenAI API 키**에 등록한다.
5. 서버 쪽 비용 상한 cron (`GET /api/cron/realtime-guard`, `Authorization: Bearer $CRON_SECRET`):
   - **Vercel Pro**: `web/vercel.json`에 아래를 추가한다. Vercel Cron이 `CRON_SECRET`을 Bearer로 붙여 호출한다.
     ```json
     { "crons": [{ "path": "/api/cron/realtime-guard", "schedule": "* * * * *" }] }
     ```
   - **Vercel Hobby**: cron이 하루 1회로 제한되므로 cron-job.org, GitHub Actions 같은 외부 스케줄러로 1~2분마다 호출한다.
   - cron이 없어도 면접 목록 조회·새 면접 생성 때 같은 정리가 실행되고, OpenAI Realtime 세션 자체도 60분이 상한이다.

## 비용 상한이 걸리는 지점

| 상황 | 동작 |
|------|------|
| 정상 종료·시간 초과 | 클라이언트가 연결을 닫고 `PATCH status` → 서버가 `hangup`도 호출 |
| 탭 정지·크래시로 클라이언트 타이머가 멈춤 | (누적 진행 시간 기준) 최대 시간 + 2분이 지나면 cron/목록 조회가 `hangup` 후 턴 기록으로 진행 시간을 추정해 `paused`(시간을 다 썼으면 `completed`, 대화가 없으면 `aborted`) |
| 새로고침으로 다시 연결 시도 | 이전 통화를 끊고 409. 화면에서 일시정지로 정리한 뒤 [이어하기]로 새 통화를 연다 (R-10) |
| 그래도 남는 위험 | OpenAI 프로젝트 월 예산 한도 |

## 질문 API (AI·스킬용)

전체 설명은 앱의 `/api-docs`(AI에게는 `/api/v1/docs` 또는 `/llms.txt` 마크다운)에 있다. 원문은 `src/lib/api-docs.ts` 한 곳이니 API를 바꾸면 같이 고친다.

- 인증: `Authorization: Bearer <토큰>`. 토큰은 **설정 > API 토큰**에서 발급한다(만료 30일/90일/1년/없음, 원문은 발급 직후 한 번만 표시, DB엔 SHA-256 해시만 저장). 환경변수 `QUESTIONS_API_KEY`도 계속 받는다(선택).
- 엔드포인트: `GET/POST /api/v1/questions`, `POST /api/v1/questions/bulk`(최대 100개, 전부 아니면 전무), `GET/PATCH/DELETE /api/v1/questions/{id}`, `GET /api/v1/categories`, `GET /api/v1/tags`

```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/questions?q=지원동기&limit=20"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BASE/api/v1/questions/bulk" -d '{"items":[{"question":"…","category":"인성"}]}'
```

오류 형식: `{ "error": { "code": "validation_error" | "unauthorized" | "not_found" | …, "message": "…" } }`

## 구조

```
src/
  proxy.ts                     로그인 보호 (/api/v1/*, /api-docs, /llms.txt 제외)
  db/schema.ts                 questions, prompts, interviews, interview_turns, api_tokens, evaluation_rubrics, interview_evaluations
  server/                      서비스 계층 (UI·API 공용) — questions, prompts, interviews, api-tokens, realtime 세션 설정, rubrics, evaluations
  server/evaluations.ts        OpenAI Responses API(JSON 스키마 고정)로 루브릭 평가 — 면접당 하나, 덮어쓰기
  lib/evaluation.ts            답변을 질문별로 묶기, 평가 프롬프트·출력 스키마, 결과 정규화, 항목 평균, 루브릭 시드
  lib/brand.ts                 서비스명·한 줄 설명 (사이드바 로고, 탭 제목, 로그인 화면이 여기서 읽음)
  lib/api-docs.ts              질문 API 설명서 원문 (/api-docs, /api/v1/docs, /llms.txt 공용)
  lib/realtime/turn-tracker.ts Realtime 이벤트 → 턴 조립 (녹음 기준 시계, 끊김 표시, 응답 지연)
  lib/realtime/interview-session.ts  WebRTC 연결·녹음·타이머·종료 처리
  lib/recorder/                혼합 녹음, IndexedDB 조각, webm 탐색 보정(ts-ebml), Blob 업로드
  lib/review.ts                답변 지표, 연결 질문 추천, 기록 마크다운
  components/recording-recovery.tsx  미업로드 녹음 자동 복구 (L-10)
  app/api/cron/realtime-guard  서버 쪽 비용 상한
  app/api/realtime/call        SDP offer를 OpenAI에 대신 전달 (API 키 비노출, call id 저장)
```

## 검증

```bash
npm test          # turn-tracker, review(복기 계산), evaluation(답변 묶기·프롬프트·결과 정규화) 단위 테스트
npm run typecheck
npm run lint
npm run build
```

## Realtime 연동 메모

- 연결은 unified 방식: 브라우저 → `POST /api/realtime/call` (SDP) → 서버가 `POST /v1/realtime/calls`에 `sdp` + `session` multipart로 전달. 응답 `Location`의 call id를 `interviews.realtime_call_id`에 저장하고, 면접이 끝나면 `POST /v1/realtime/calls/{id}/hangup`으로 서버에서도 끊는다.
- 끼어들기는 `output_audio_buffer.cleared` / `response.done(status=cancelled)`로 판정해 `interrupted`만 표시한다.
- 면접관 턴 시각은 `output_audio_buffer.started/stopped` 수신 시점, 지원자 턴은 `speech_started/stopped` 수신 시점의 AudioContext 시계로 잰다.
- 종료 화면과 콘솔(`[interview metrics]`)에 응답 지연 p50/p95와 usage 합계가 나온다 — M4 비용·지연 실측용.
