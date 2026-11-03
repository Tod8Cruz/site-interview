import { LogoMark } from "@/components/logo";
import { BRAND } from "@/lib/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="text-primary"><LogoMark className="size-10" /></span>
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-tight">{BRAND.name}</h1>
            <p className="text-xs text-muted">{BRAND.tagline}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted">비밀번호를 입력하세요.</p>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </div>
    </main>
  );
}
