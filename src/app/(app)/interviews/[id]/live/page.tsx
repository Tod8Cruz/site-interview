import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/server/http";
import { getInterview } from "@/server/interviews";
import { getQuestionsByIds } from "@/server/questions";
import { LiveInterview } from "./live-interview";

export default async function LivePage(props: PageProps<"/interviews/[id]/live">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const interview = await getInterview(id);
  if (!interview) notFound();
  if (interview.status !== "in_progress") redirect(`/interviews/${id}`);
  // 면접관이 부르는 번호는 questionIds 순서 기준이므로, 질문이 지워졌어도 자리를 비워 두지 않는다.
  const rows = await getQuestionsByIds(interview.questionIds);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const questions = interview.questionIds.map((qid) => {
    const row = byId.get(qid);
    return { id: qid, question: row?.question ?? "(삭제된 질문)", modelAnswer: row?.modelAnswer ?? "" };
  });
  return (
    <LiveInterview
      interviewId={id}
      title={interview.title}
      maxMinutes={interview.maxMinutes}
      questions={questions}
      alreadyStarted={Boolean(interview.realtimeCallId)}
    />
  );
}
