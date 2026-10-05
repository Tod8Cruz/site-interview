import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { listCategories } from "@/server/questions";
import { QuestionForm } from "../question-form";

export default async function NewQuestionPage() {
  await connection();
  const categories = await listCategories();
  return (
    <>
      <PageHeader title="질문 추가" />
      <QuestionForm categories={categories} />
    </>
  );
}
