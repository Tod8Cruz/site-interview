import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { AUDIO_LABEL, formatDateTime, formatDuration, STATUS_LABEL } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getInterview, getNotedQuestionIds, listInterviews } from "@/server/interviews";
import { listProfiles } from "@/server/profiles";
import { listPrompts } from "@/server/prompts";
import { listQuestionGroups } from "@/server/question-groups";
import { listQuestions } from "@/server/questions";
import { DeleteInterviewButton } from "./delete-button";
import { StartInterview, type StartPrefill } from "./start-interview";

const statusTone = {
  in_progress: "bg-warning/15 text-warning",
  paused: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  aborted: "bg-danger/15 text-danger",
} as const;

const isOpen = (status: keyof typeof statusTone) => status === "in_progress" || status === "paused";

async function loadPrefill(userId: string, from: string | null, notedOnly: boolean): Promise<StartPrefill | null> {
  if (!from) return null;
  const source = await getInterview(userId, from);
  if (!source) return null;
  return {
    sourceInterviewId: source.id,
    sourceTitle: source.title,
    promptId: source.promptId,
    candidateProfileId: source.candidateProfileId,
    questionIds: notedOnly ? await getNotedQuestionIds(source.id) : source.questionIds,
    notedOnly,
  };
}

export default async function InterviewsPage(props: PageProps<"/interviews">) {
  await connection();
  const { id: userId } = await requireUser();
  const { start, from, only } = await props.searchParams;
  const sourceId = typeof from === "string" && isUuid(from) ? from : null;
  const [interviews, prompts, profiles, groups, { items: questions }, prefill] = await Promise.all([
    listInterviews(userId),
    listPrompts(userId),
    listProfiles(userId),
    listQuestionGroups(userId),
    listQuestions(userId),
    loadPrefill(userId, sourceId, only === "noted"),
  ]);
  const startProps = {
    prompts,
    profiles,
    groups: groups.map((g) => ({ id: g.id, name: g.name, isDefault: g.isDefault })),
    questions: questions.map((q) => ({ id: q.id, groupId: q.groupId, question: q.question, category: q.category })),
    prefill,
    autoOpen: start === "1",
  };
  return (
    <>
      <PageHeader
        title="모의 면접"
        description="AI 면접관과 음성으로 연습하고, 녹음과 대화 기록으로 복기하세요."
        actions={<StartInterview {...startProps} label="면접 시작" />}
      />
      {interviews.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          <p className="mb-3">아직 진행한 면접이 없습니다. 오른쪽 위의 <b>면접 시작</b>을 눌러 첫 모의 면접을 해 보세요.</p>
          {profiles.length === 0 && (
            <p className="mb-3">
              먼저 <Link href="/profiles/new" className="text-primary underline">지원자 정보를 추가</Link>하면 면접관이 그 내용으로 질문합니다.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {interviews.map((iv) => (
            <li key={iv.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <Link
                href={isOpen(iv.status) ? `/interviews/${iv.id}/live` : `/interviews/${iv.id}`}
                className="min-w-0 flex-1 basis-60"
              >
                <p className="truncate font-medium hover:underline">{iv.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(iv.startedAt)} · {iv.promptName} · 질문 {iv.questionCount}개
                  {iv.status === "paused" && iv.questionCount > 0 && (
                    <> · {iv.currentQuestionIndex === null ? "인사 단계" : `${iv.currentQuestionIndex + 1}번 진행 중`}</>
                  )}
                </p>
              </Link>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="tabular-nums text-muted">
                  {formatDuration(iv.durationMs)}
                  {iv.status === "paused" && ` / ${iv.maxMinutes}:00`}
                </span>
                <span className={`chip ${statusTone[iv.status]}`}>{STATUS_LABEL[iv.status]}</span>
                {iv.status === "paused" && (
                  <Link href={`/interviews/${iv.id}/live`} className="btn btn-sm btn-primary">이어하기</Link>
                )}
                {!isOpen(iv.status) && <span className="chip">{AUDIO_LABEL[iv.audioStatus]}</span>}
                {iv.evaluated && <span className="chip bg-success/15 text-success">평가됨</span>}
                <DeleteInterviewButton id={iv.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
