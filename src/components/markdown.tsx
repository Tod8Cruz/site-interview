import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingSlug } from "@/lib/slug";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/** 제목에 텍스트로 만든 id를 붙여 #앵커 링크가 되게 한다. */
const anchoredHeadings: Components = Object.fromEntries(
  (["h1", "h2", "h3", "h4"] as const).map((Tag) => [
    Tag,
    ({ children }: { children?: ReactNode }) => (
      <Tag id={headingSlug(textOf(children))} className="scroll-mt-4">
        {children}
      </Tag>
    ),
  ]),
);

export function Markdown({ children, anchors = false }: { children: string; anchors?: boolean }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={anchors ? anchoredHeadings : undefined}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
