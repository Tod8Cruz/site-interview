import { AuthCard } from "@/app/login/auth-card";
import { LoginForm } from "@/app/login/login-form";

export default function SignupPage() {
  return (
    <AuthCard subtitle="계정을 만들면 예상 질문·면접 기록은 이 계정에만 저장됩니다. 가입 후 OpenAI API 키를 등록해야 면접을 시작할 수 있습니다.">
      <LoginForm mode="signup" />
    </AuthCard>
  );
}
