import Link from "next/link";
import { notFound } from "next/navigation";
import { AUDIO_LABEL, formatDateTime, formatDuration, STATUS_LABEL } from "@/lib/format";
import { getEvaluation } from "@/server/evaluations";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getInterview, getInterviewRecordings, getInterviewTurns } from "@/server/interviews";
import { getQuestionsByIds } from "@/server/questions";
import { listRubrics } from "@/server/rubrics";
import { getOpenAIApiKey } from "@/server/settings";
import { DeleteInterviewButton } from "../delete-button";
import { EvaluationPanel } from "./evaluation-panel";
import { Replay } from "./replay";
import { TitleEditor } from "./title-editor";

export default async function InterviewPage(props: PageProps<"/interviews/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const interview = await getInterview(userId, id);
  if (!interview) notFound();
  const [turns, recordings, evaluation, rubrics, apiKey, questions] = await Promise.all([
    getInterviewTurns(id),
    getInterviewRecordings(id),
    getEvaluation(id),
    listRubrics(userId),
    getOpenAIApiKey(userId),
    getQuestionsByIds(userId, interview.questionIds),
  ]);

  const finished = interview.status === "completed" || interview.status === "aborted";
  const hasAnswers = turns.some((t) => t.role === "candidate" && t.text.trim());
  const blockedReason = !finished ? "면접을 마친 뒤에 평가할 수 있습니다." : !hasAnswers ? "평가할 지원자 답변이 없습니다." : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <TitleEditor interviewId={id} title={interview.title} />
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(interview.startedAt)} · {interview.promptName} · {formatDuration(interview.durationMs)} ·{" "}
            {STATUS_LABEL[interview.status]} · {AUDIO_LABEL[interview.audioStatus]}
          </p>
        </div>
        <div className="flex gap-2">
          {interview.status === "in_progress" && (
            <Link href={`/interviews/${id}/live`} className="btn btn-primary">면접 화면으로</Link>
          )}
          {interview.status === "paused" && (
            <Link href={`/interviews/${id}/live`} className="btn btn-primary">이어하기</Link>
          )}
          <DeleteInterviewButton id={id} redirectTo="/interviews" />
        </div>
      </div>
      <Replay
        interviewId={id}
        title={interview.title}
        segments={recordings.map((r) => ({
          url: `/api/interviews/${id}/recordings/${r.id}/audio`,
          startMs: r.startMs,
          durationMs: r.durationMs,
        }))}
        audioStatus={interview.audioStatus}
        questions={questions.map((q) => ({ id: q.id, question: q.question }))}
        turns={turns.map((t) => ({
          id: t.id,
          role: t.role,
          text: t.text,
          startMs: t.startMs,
          endMs: t.endMs,
          interrupted: t.interrupted,
          note: t.note,
          noteQuestionId: t.noteQuestionId,
          questionId: t.questionId,
        }))}
      />
      <EvaluationPanel
        interviewId={id}
        canEvaluate={blockedReason === null}
        blockedReason={blockedReason}
        openaiConfigured={Boolean(apiKey)}
        rubrics={rubrics.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }))}
        evaluation={
          evaluation && {
            rubricName: evaluation.rubricName,
            criteria: evaluation.criteria,
            model: evaluation.model,
            result: evaluation.result,
            evaluatedAt: formatDateTime(evaluation.updatedAt),
          }
        }
      />
      <details className="card mt-4 p-4 text-sm">
        <summary className="cursor-pointer font-medium">사용한 프롬프트 (면접 시작 시점 스냅샷)</summary>
        <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">{interview.instructions}</pre>
      </details>
    </>
  );
}
