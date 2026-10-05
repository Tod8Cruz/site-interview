import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { isUuid } from "@/server/http";
import { getQuestion, listCategories } from "@/server/questions";
import { QuestionForm } from "../question-form";

export default async function EditQuestionPage(props: PageProps<"/questions/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [question, categories] = await Promise.all([getQuestion(id), listCategories()]);
  if (!question) notFound();
  return (
    <>
      <PageHeader title="질문 수정" />
      <QuestionForm question={question} categories={categories} />
    </>
  );
}
