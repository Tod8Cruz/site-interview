import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { listApiTokens } from "@/server/api-tokens";
import { requestOrigin } from "@/server/origin";
import { getOpenAIKeyStatus } from "@/server/settings";
import { ApiTokens } from "./api-tokens";
import { OpenAIKey } from "./openai-key";

export default async function SettingsPage() {
  await connection();
  const { id: userId } = await requireUser();
  const [tokens, origin, openaiKey] = await Promise.all([
    listApiTokens(userId),
    requestOrigin(),
    getOpenAIKeyStatus(userId),
  ]);
  return (
    <>
      <PageHeader title="설정" />
      <section id="openai">
        <div className="mb-3">
          <h2 className="font-semibold">OpenAI API 키</h2>
          <p className="text-sm text-muted">
            모의 면접(Realtime)에 쓰는 키입니다. 계정에 저장되며, 면접을 시작하려면 반드시 등록해야 합니다.
          </p>
        </div>
        <OpenAIKey status={openaiKey} />
      </section>
      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">API 토큰</h2>
            <p className="text-sm text-muted">
              AI나 스크립트가 예상 질문·프롬프트·평가 기준을 읽고 추가·수정·삭제할 때 씁니다.
              AI용 마크다운: <code className="rounded bg-surface-2 px-1 text-xs">{origin}/api/v1/docs</code>
            </p>
          </div>
          <a href="/api-docs" target="_blank" rel="noopener" className="btn">문서 보기</a>
        </div>
        <ApiTokens origin={origin} tokens={tokens} />
      </section>
    </>
  );
}
