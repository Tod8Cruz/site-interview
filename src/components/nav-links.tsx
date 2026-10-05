"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/questions", label: "예상 질문" },
  { href: "/interviews", label: "모의 면접" },
  { href: "/prompts", label: "프롬프트" },
  { href: "/settings", label: "설정" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${
              active ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
