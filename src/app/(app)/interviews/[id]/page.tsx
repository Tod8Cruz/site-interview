import Link from "next/link";
import { notFound } from "next/navigation";
import { AUDIO_LABEL, formatDateTime, formatDuration, STATUS_LABEL } from "@/lib/format";
import { isUuid } from "@/server/http";
import { getInterview, getInterviewTurns } from "@/server/interviews";
import { getQuestionsByIds } from "@/server/questions";
import { DeleteInterviewButton } from "../delete-button";
import { Replay } from "./replay";
import { TitleEditor } from "./title-editor";

export default async function InterviewPage(props: PageProps<"/interviews/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [interview, turns] = await Promise.all([getInterview(id), getInterviewTurns(id)]);
  if (!interview) notFound();
  const questions = await getQuestionsByIds(interview.questionIds);

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
          <DeleteInterviewButton id={id} redirectTo="/interviews" />
        </div>
      </div>
      <Replay
        interviewId={id}
        title={interview.title}
        audioUrl={interview.audioUrl}
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
        }))}
      />
      <details className="card mt-4 p-4 text-sm">
        <summary className="cursor-pointer font-medium">사용한 프롬프트 (면접 시작 시점 스냅샷)</summary>
        <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">{interview.instructions}</pre>
      </details>
    </>
  );
}
