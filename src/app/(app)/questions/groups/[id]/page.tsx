import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getQuestionGroup } from "@/server/question-groups";
import { listQuestions } from "@/server/questions";
import { QuestionList } from "../../question-list";
import { GroupTitle } from "../group-forms";

export default async function QuestionGroupPage(props: PageProps<"/questions/groups/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const sp = await props.searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const filter = { groupId: id, q: pick(sp.q) };
  const [group, { items, total }] = await Promise.all([getQuestionGroup(userId, id), listQuestions(userId, filter)]);
  if (!group) notFound();
  const here = `/questions/groups/${id}`;

  return (
    <>
      <Link href="/questions" className="mb-2 inline-block text-sm text-muted hover:text-text">← 그룹 목록</Link>
      <PageHeader
        title={<GroupTitle group={group} />}
        description={`질문 ${total}개${group.isDefault ? " · 기본 그룹" : ""}`}
        actions={<Link href={`/questions/new?group=${id}`} className="btn btn-primary">질문 추가</Link>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={filter.q} placeholder="질문·답변 검색" className="input min-w-0 flex-1 basis-48" />
        <button className="btn">찾기</button>
        {filter.q && <Link href={here} className="btn">초기화</Link>}
      </form>
      <QuestionList questions={items} groupId={id} />
    </>
  );
}
