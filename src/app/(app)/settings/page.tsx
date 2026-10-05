import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { listApiTokens } from "@/server/api-tokens";
import { requestOrigin } from "@/server/origin";
import { listProfiles } from "@/server/profiles";
import { makeDefaultProfile } from "./actions";
import { ApiTokens } from "./api-tokens";

export default async function SettingsPage() {
  await connection();
  const [profiles, tokens, origin] = await Promise.all([listProfiles(), listApiTokens(), requestOrigin()]);
  return (
    <>
      <PageHeader title="설정" />
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">지원자 정보</h2>
            <p className="text-sm text-muted">면접을 시작할 때 고릅니다. 지원하는 곳마다 하나씩 만들어 두세요.</p>
          </div>
          <Link href="/settings/profiles/new" className="btn btn-primary">지원자 정보 추가</Link>
        </div>
        {profiles.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            아직 지원자 정보가 없습니다.{" "}
            <Link href="/settings/profiles/new" className="text-primary underline">첫 지원자 정보를 추가</Link>하세요.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <li key={p.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/settings/profiles/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  {p.isDefault && <span className="chip shrink-0 bg-primary/15 text-primary">기본값</span>}
                </div>
                <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-line text-xs text-muted">{p.content}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Link href={`/settings/profiles/${p.id}`} className="btn btn-sm">수정</Link>
                  {!p.isDefault && (
                    <form action={makeDefaultProfile.bind(null, p.id)} className="ml-auto">
                      <button className="btn btn-sm">기본값으로</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <div className="mb-3">
          <h2 className="font-semibold">API 토큰</h2>
          <p className="text-sm text-muted">
            AI나 스크립트가 예상 질문을 읽고 추가·수정·삭제할 때 씁니다. 사용법은{" "}
            <a href="/api-docs" target="_blank" className="text-primary underline">API 문서</a>
            (AI용 마크다운: <code className="rounded bg-surface-2 px-1 text-xs">{origin}/api/v1/docs</code>)에 있습니다.
          </p>
        </div>
        <ApiTokens origin={origin} tokens={tokens} />
      </section>
    </>
  );
}
