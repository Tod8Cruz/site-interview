import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listQuestionGroups } from "@/server/question-groups";
import { QuestionForm } from "../question-form";

export default async function NewQuestionPage(props: PageProps<"/questions/new">) {
  await connection();
  const { id: userId } = await requireUser();
  const { group } = await props.searchParams;
  const groups = await listQuestionGroups(userId);
  const initialGroupId = groups.find((g) => g.id === group)?.id;
  return (
    <>
      <PageHeader title="질문 추가" />
      <QuestionForm groups={groups} initialGroupId={initialGroupId} />
    </>
  );
}
