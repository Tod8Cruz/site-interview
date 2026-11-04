import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listProfiles } from "@/server/profiles";
import { makeDefaultProfile } from "./actions";

export default async function ProfilesPage() {
  await connection();
  const { id: userId } = await requireUser();
  const profiles = await listProfiles(userId);
  return (
    <>
      <PageHeader
        title="지원자 정보"
        description="면접을 시작할 때 고릅니다. 지원하는 곳마다 하나씩 만들어 두세요."
        actions={<Link href="/profiles/new" className="btn btn-primary">지원자 정보 추가</Link>}
      />
      {profiles.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          아직 지원자 정보가 없습니다.{" "}
          <Link href="/profiles/new" className="text-primary underline">첫 지원자 정보를 추가</Link>하세요.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="card relative flex flex-col p-4 transition-colors hover:border-primary/50 hover:bg-surface-2/60 focus-within:ring-2 focus-within:ring-primary/30"
            >
              <div className="flex items-start justify-between gap-2">
                {/* 카드 전체가 편집 링크의 클릭 영역이 된다 */}
                <Link
                  href={`/profiles/${p.id}`}
                  className="font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                >
                  {p.name}
                </Link>
                {p.isDefault && <span className="chip shrink-0 bg-primary/15 text-primary">기본값</span>}
              </div>
              <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-line text-xs text-muted">{p.content}</p>
              {!p.isDefault && (
                <div className="mt-3 flex items-center">
                  <form action={makeDefaultProfile.bind(null, p.id)} className="relative z-10 ml-auto">
                    <button className="btn btn-sm">기본값으로</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
