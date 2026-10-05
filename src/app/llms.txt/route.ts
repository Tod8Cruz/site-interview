import { apiDocsMarkdown } from "@/lib/api-docs";

export function GET(request: Request) {
  return new Response(apiDocsMarkdown(new URL(request.url).origin), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
