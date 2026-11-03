import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  return (
    <AuthCard subtitle="이메일과 비밀번호로 로그인하세요.">
      <LoginForm mode="login" next={typeof next === "string" ? next : ""} />
    </AuthCard>
  );
}
