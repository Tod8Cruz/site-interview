import { logout } from "@/app/login/actions";
import { NavLinks } from "@/components/nav-links";
import { RecordingRecovery } from "@/components/recording-recovery";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-4">
          <span className="hidden shrink-0 font-semibold sm:inline">모의 면접</span>
          <NavLinks />
          <form action={logout} className="ml-auto">
            <button className="whitespace-nowrap text-sm text-muted hover:text-text">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <RecordingRecovery />
    </>
  );
}
