import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listRubrics } from "@/server/rubrics";
import { makeDefaultRubric } from "./actions";

export default async function RubricsPage() {
  await connection();
  const { id: userId } = await requireUser();
  const rubrics = await listRubrics(userId);
  return (
    <>
      <PageHeader
        title="평가 기준"
        description="AI 평가가 답변을 볼 때 쓰는 항목입니다. 면접 다시 보기에서 기준을 골라 평가합니다. 고쳐도 이미 저장된 평가에는 영향이 없습니다."
        actions={<Link href="/rubrics/new" className="btn btn-primary">평가 기준 추가</Link>}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {rubrics.map((r) => (
          <li
            key={r.id}
            className="card relative flex min-w-0 flex-col p-4 transition-colors hover:border-primary/50 hover:bg-surface-2/60 focus-within:ring-2 focus-within:ring-primary/30"
          >
            <div className="flex items-start justify-between gap-2">
              {/* 카드 전체가 편집 링크의 클릭 영역이 된다 */}
              <Link
                href={`/rubrics/${r.id}`}
                className="font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
              >
                {r.name}
              </Link>
              {r.isDefault && <span className="chip shrink-0 bg-primary/15 text-primary">기본값</span>}
            </div>
            <ol className="mt-2 flex-1 space-y-1 text-xs text-muted">
              {r.criteria.map((c, i) => (
                <li key={c.id} className="truncate">
                  {i + 1}. <span className="text-text">{c.name}</span>
                  {c.description && <> — {c.description}</>}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="chip">항목 {r.criteria.length}개</span>
              {!r.isDefault && (
                <form action={makeDefaultRubric.bind(null, r.id)} className="relative z-10 ml-auto">
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
