import { apiDocsMarkdown } from "@/lib/api-docs";

/** AI가 읽는 API 설명서. 인증 없이 열린다. */
export function GET(request: Request) {
  return new Response(apiDocsMarkdown(new URL(request.url).origin), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
