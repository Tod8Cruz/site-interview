import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { apiDocsMarkdown } from "@/lib/api-docs";
import { requestOrigin } from "@/server/origin";

export const metadata: Metadata = { title: "질문 API 문서 — 모의 면접" };

/** 로그인 없이 열리는 API 설명 페이지 (사람·AI 공용). */
export default async function ApiDocsPage() {
  const origin = await requestOrigin();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="mb-6 text-sm text-muted">
        마크다운 원문: <a href="/api/v1/docs" className="text-primary underline">/api/v1/docs</a> ·{" "}
        <a href="/llms.txt" className="text-primary underline">/llms.txt</a>
      </p>
      <article className="api-docs">
        <Markdown>{apiDocsMarkdown(origin)}</Markdown>
      </article>
    </main>
  );
}
