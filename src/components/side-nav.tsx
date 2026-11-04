"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

/** 맨 위: 모의 면접. 가운데: 면접 설정 섹션. 맨 아래: 설정. */
const TOP: Item[] = [{ href: "/interviews", label: "모의 면접" }];
const SETUP: Item[] = [
  { href: "/profiles", label: "지원자 정보" },
  { href: "/questions", label: "예상 질문" },
  { href: "/prompts", label: "면접관 설정" },
  { href: "/rubrics", label: "평가 기준" },
];
const BOTTOM: Item[] = [{ href: "/settings", label: "설정" }];

/**
 * 주 메뉴. md 이상에서는 세로 사이드바, 그보다 좁으면 상단 가로 스크롤 한 줄로 접힌다.
 * 섹션 묶음은 좁은 화면에서 display: contents로 풀어 한 줄에 이어 붙인다.
 */
export function SideNav() {
  const pathname = usePathname();
  const item = (link: Item, emphasis = false) => {
    const active = pathname.startsWith(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
          active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
        } ${emphasis ? "font-semibold" : ""}`}
      >
        {link.label}
      </Link>
    );
  };
  return (
    <nav aria-label="주 메뉴" className="flex shrink-0 items-center gap-1 md:flex-col md:items-stretch md:gap-0.5">
      {TOP.map((l) => item(l, true))}
      <div className="contents md:mt-5 md:block">
        <p className="hidden px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted md:block">면접 설정</p>
        {SETUP.map((l) => item(l))}
      </div>
      <div className="contents md:mt-5 md:block">{BOTTOM.map((l) => item(l))}</div>
    </nav>
  );
}
