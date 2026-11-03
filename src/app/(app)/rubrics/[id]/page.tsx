import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getRubric } from "@/server/rubrics";
import { RubricForm } from "../rubric-form";

export default async function EditRubricPage(props: PageProps<"/rubrics/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const rubric = await getRubric(userId, id);
  if (!rubric) notFound();
  return (
    <>
      <PageHeader title="평가 기준 수정" description="고쳐도 이미 저장된 평가 결과에는 영향이 없습니다." />
      <RubricForm rubric={rubric} />
    </>
  );
}
