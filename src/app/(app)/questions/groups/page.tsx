import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listQuestionGroups } from "@/server/question-groups";
import { GroupRow, NewGroupForm } from "./group-row";

export default async function QuestionGroupsPage() {
  await connection();
  const { id: userId } = await requireUser();
  const groups = await listQuestionGroups(userId);
  const defaultName = groups.find((g) => g.isDefault)?.name ?? "기본";
  return (
    <>
      <PageHeader
        title="질문 그룹"
        description="면접을 시작할 때 그룹을 고르고, 그 안에서 질문을 뽑습니다. 기본 그룹은 처음에 선택되어 있고 지울 수 없습니다."
        actions={<Link href="/questions" className="btn">질문 목록</Link>}
      />
      <ul className="space-y-2">
        {groups.map((g) => <GroupRow key={g.id} group={g} defaultName={defaultName} />)}
      </ul>
      <div className="mt-4">
        <NewGroupForm />
      </div>
    </>
  );
}
