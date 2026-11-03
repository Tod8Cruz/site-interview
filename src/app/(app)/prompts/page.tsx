import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listPrompts } from "@/server/prompts";
import { makeDefault } from "./actions";

export default async function PromptsPage() {
  await connection();
  const { id: userId } = await requireUser();
  const prompts = await listPrompts(userId);
  return (
    <>
      <PageHeader
        title="면접 프롬프트"
        description="면접관의 성격과 진행 방식을 정합니다. 면접을 시작할 때 고를 수 있습니다."
        actions={<Link href="/prompts/new" className="btn btn-primary">프롬프트 추가</Link>}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {prompts.map((p) => (
          <li
            key={p.id}
            className="card relative flex flex-col p-4 transition-colors hover:border-primary/50 hover:bg-surface-2/60 focus-within:ring-2 focus-within:ring-primary/30"
          >
            <div className="flex items-start justify-between gap-2">
              {/* 카드 전체가 편집 링크의 클릭 영역이 된다 */}
              <Link
                href={`/prompts/${p.id}`}
                className="font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
              >
                {p.name}
              </Link>
              {p.isDefault && <span className="chip shrink-0 bg-primary/15 text-primary">기본값</span>}
            </div>
            <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-line text-xs text-muted">{p.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="chip">{p.voice}</span>
              <span className="chip">{p.maxMinutes}분</span>
              <span className="chip">
                {p.turnDetection === "semantic_vad" ? `의미 기반 · ${p.vadEagerness}` : `침묵 ${p.silenceMs}ms`}
              </span>
              {!p.isDefault && (
                <form action={makeDefault.bind(null, p.id)} className="relative z-10 ml-auto">
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
