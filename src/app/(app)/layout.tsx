import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { RecordingRecovery } from "@/components/recording-recovery";
import { SideNav } from "@/components/side-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* md 이상: 왼쪽 고정 사이드바. 그보다 좁으면 상단 고정 바 한 줄. */}
      <aside className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:h-dvh md:w-56 md:flex-col md:items-stretch md:gap-0 md:self-start md:border-b-0 md:border-r md:bg-surface md:px-3 md:py-4 md:backdrop-blur-none">
        {/* 좁은 화면은 마크+이름 한 줄, 사이드바에서는 한 줄 설명까지 */}
        <div className="shrink-0 md:hidden"><Logo compact /></div>
        <div className="hidden md:mb-5 md:block md:px-1"><Logo /></div>
        {/* 좁은 화면에서는 메뉴와 로그아웃이 한 줄로 가로 스크롤된다 */}
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto md:flex-col md:items-stretch md:gap-0 md:overflow-visible">
          <SideNav />
          <form action={logout} className="ml-auto shrink-0 md:ml-0 md:mt-auto md:border-t md:border-border md:pt-3">
            <button className="whitespace-nowrap text-sm text-muted hover:text-text md:block md:w-full md:rounded-md md:px-2.5 md:py-1.5 md:text-left md:hover:bg-surface-2/60">
              로그아웃
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <RecordingRecovery />
    </div>
  );
}
