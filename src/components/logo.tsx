import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** 로고 마크: primary 둥근 사각형 안의 마이크. 색은 currentColor라 부모의 text 색을 따른다. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="6.5" fill="currentColor" />
      <rect x="9.6" y="4.6" width="4.8" height="9" rx="2.4" fill="var(--primary-fg)" />
      <path
        d="M7.2 11.4a4.8 4.8 0 0 0 9.6 0M12 16.2v2.6M9.6 18.8h4.8"
        fill="none"
        stroke="var(--primary-fg)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 마크 + 서비스명. 사이드바 맨 위와 로그인 화면에 쓴다.
 * compact면 한 줄(마크 + 이름), 아니면 이름 아래 한 줄 설명까지.
 */
export function Logo({ compact = false, href = "/interviews" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <span className="text-primary">
        <LogoMark className={compact ? "size-7" : "size-9"} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-bold tracking-tight">{BRAND.name}</span>
        {!compact && <span className="block truncate text-[11px] text-muted">{BRAND.tagline}</span>}
      </span>
    </Link>
  );
}
