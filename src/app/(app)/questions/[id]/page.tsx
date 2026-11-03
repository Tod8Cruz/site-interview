import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getQuestion, listCategories } from "@/server/questions";
import { QuestionForm } from "../question-form";

export default async function EditQuestionPage(props: PageProps<"/questions/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const [question, categories] = await Promise.all([getQuestion(userId, id), listCategories(userId)]);
  if (!question) notFound();
  return (
    <>
      <PageHeader title="질문 수정" />
      <QuestionForm question={question} categories={categories} />
    </>
  );
}
