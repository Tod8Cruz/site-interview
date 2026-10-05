import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/server/http";
import { getInterview } from "@/server/interviews";
import { LiveInterview } from "./live-interview";

export default async function LivePage(props: PageProps<"/interviews/[id]/live">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const interview = await getInterview(id);
  if (!interview) notFound();
  if (interview.status !== "in_progress") redirect(`/interviews/${id}`);
  return (
    <LiveInterview
      interviewId={id}
      title={interview.title}
      maxMinutes={interview.maxMinutes}
      alreadyStarted={Boolean(interview.realtimeCallId)}
    />
  );
}
