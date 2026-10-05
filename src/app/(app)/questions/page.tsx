import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { listCategories, listQuestions, listTags } from "@/server/questions";
import { QuestionList } from "./question-list";

export default async function QuestionsPage(props: PageProps<"/questions">) {
  await connection();
  const sp = await props.searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const filter = { q: pick(sp.q), category: pick(sp.category), tag: pick(sp.tag) };
  const [{ items, total }, categories, tags] = await Promise.all([
    listQuestions(filter),
    listCategories(),
    listTags(),
  ]);

  return (
    <>
      <PageHeader
        title="예상 질문"
        description={`${total}개`}
        actions={<Link href="/questions/new" className="btn btn-primary">질문 추가</Link>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
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
        {(filter.q || filter.category || filter.tag) && <Link href="/questions" className="btn">초기화</Link>}
      </form>
      <QuestionList questions={items} />
    </>
  );
}
