import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listQuestionGroups } from "@/server/question-groups";
import { makeDefaultGroup } from "./groups/actions";
import { NewGroupButton } from "./groups/group-forms";

/** 예상 질문 첫 화면: 그룹 목록. 그룹을 누르면 그 그룹의 질문이 나온다. */
export default async function QuestionGroupsPage() {
  await connection();
  const { id: userId } = await requireUser();
  const groups = await listQuestionGroups(userId);
  return (
    <>
      <PageHeader
        title="예상 질문"
        description="질문을 그룹으로 묶어 관리합니다. 면접을 시작할 때 그룹을 고르고, 그 안에서 질문을 뽑습니다."
        actions={<NewGroupButton />}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <li
            key={g.id}
            className="card relative flex flex-col p-4 transition-colors hover:border-primary/50 hover:bg-surface-2/60 focus-within:ring-2 focus-within:ring-primary/30"
          >
            <div className="flex items-start justify-between gap-2">
              {/* 카드 전체가 그룹 링크의 클릭 영역이 된다 */}
              <Link
                href={`/questions/groups/${g.id}`}
                className="font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
              >
                {g.name}
              </Link>
              {g.isDefault && <span className="chip shrink-0 bg-primary/15 text-primary">기본값</span>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted">질문 {g.questionCount}개</span>
              {!g.isDefault && (
                <form action={makeDefaultGroup.bind(null, g.id)} className="relative z-10 ml-auto">
                  <button className="btn btn-sm">기본값으로</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
