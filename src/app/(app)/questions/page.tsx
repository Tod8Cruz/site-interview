import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { listQuestionGroups } from "@/server/question-groups";
import { listCategories, listQuestions, listTags } from "@/server/questions";
import { QuestionList } from "./question-list";

export default async function QuestionsPage(props: PageProps<"/questions">) {
  await connection();
  const { id: userId } = await requireUser();
  const sp = await props.searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const group = pick(sp.group);
  const groupId = group && isUuid(group) ? group : undefined;
  const filter = { groupId, q: pick(sp.q), category: pick(sp.category), tag: pick(sp.tag) };
  const [{ items, total }, categories, tags, groups] = await Promise.all([
    listQuestions(userId, filter),
    listCategories(userId),
    listTags(userId),
    listQuestionGroups(userId),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <>
      <PageHeader
        title="예상 질문"
        description={`${total}개`}
        actions={
          <>
            <Link href="/questions/groups" className="btn">그룹 관리</Link>
            <Link href={groupId ? `/questions/new?group=${groupId}` : "/questions/new"} className="btn btn-primary">
              질문 추가
            </Link>
          </>
        }
      />
      <nav aria-label="질문 그룹" className="mb-3 flex flex-wrap gap-1.5">
        {[{ id: undefined, name: "전체", questionCount: groups.reduce((n, g) => n + g.questionCount, 0) }, ...groups].map((g) => (
          <Link
            key={g.id ?? "all"}
            href={g.id ? `/questions?group=${g.id}` : "/questions"}
            aria-current={g.id === groupId ? "page" : undefined}
            className={`btn btn-sm ${g.id === groupId ? "border-primary text-primary" : ""}`}
          >
            {g.name} <span className="text-muted">{g.questionCount}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex flex-wrap gap-2">
        {groupId && <input type="hidden" name="group" value={groupId} />}
        <input name="q" defaultValue={filter.q} placeholder="질문·답변 검색" className="input min-w-0 flex-1 basis-48" />
        <select name="category" defaultValue={filter.category ?? ""} className="input w-auto">
          <option value="">모든 카테고리</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="tag" defaultValue={filter.tag ?? ""} className="input w-auto">
          <option value="">모든 태그</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        <button className="btn">찾기</button>
        {(filter.q || filter.category || filter.tag) && (
          <Link href={groupId ? `/questions?group=${groupId}` : "/questions"} className="btn">초기화</Link>
        )}
      </form>
      <QuestionList
        questions={items.map((q) => ({ ...q, groupName: groupId ? null : (groupName.get(q.groupId) ?? null) }))}
      />
    </>
  );
}
