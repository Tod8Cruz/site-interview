import { notFound, redirect } from "next/navigation";
import { resumeQuestionIndex } from "@/lib/interview-time";
import { isUuid } from "@/server/http";
import { getInterview, getInterviewTurns } from "@/server/interviews";
import { getQuestionsByIds } from "@/server/questions";
import { LiveInterview } from "./live-interview";

export default async function LivePage(props: PageProps<"/interviews/[id]/live">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const interview = await getInterview(id);
  if (!interview) notFound();
  if (interview.status !== "in_progress" && interview.status !== "paused") redirect(`/interviews/${id}`);
  // 면접관이 부르는 번호는 questionIds 순서 기준이므로, 질문이 지워졌어도 자리를 비워 두지 않는다.
  const rows = await getQuestionsByIds(interview.questionIds);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const questions = interview.questionIds.map((qid) => {
    const row = byId.get(qid);
    return { id: qid, question: row?.question ?? "(삭제된 질문)", modelAnswer: row?.modelAnswer ?? "" };
  });
  // 일시정지된 면접: 이어가기 위해 지금까지의 대화와 진행 위치를 내려준다.
  const turns = interview.status === "paused" ? await getInterviewTurns(id) : [];
  const resume =
    interview.status === "paused"
      ? {
          activeMs: interview.durationMs ?? 0,
          questionIndex: resumeQuestionIndex(interview.currentQuestionIndex, turns, interview.questionIds),
          turns: turns.map((t) => ({ role: t.role, text: t.text, interrupted: t.interrupted })),
          pausedAt: (interview.pausedAt ?? new Date()).toISOString(),
        }
      : null;
  return (
    <LiveInterview
      interviewId={id}
      title={interview.title}
      maxMinutes={interview.maxMinutes}
      questions={questions}
      alreadyStarted={interview.status === "in_progress" && Boolean(interview.realtimeCallId)}
      resume={resume}
    />
  );
}
