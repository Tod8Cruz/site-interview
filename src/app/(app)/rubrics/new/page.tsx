import { PageHeader } from "@/components/page-header";
import { RubricForm } from "../rubric-form";

export default function NewRubricPage() {
  return (
    <>
      <PageHeader title="평가 기준 추가" />
      <RubricForm />
    </>
  );
}
