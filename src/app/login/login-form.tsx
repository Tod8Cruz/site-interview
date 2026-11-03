"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { login, signup, type LoginState } from "./actions";

/** 로그인과 회원가입이 같은 폼을 쓴다. 회원가입은 비밀번호 확인 칸이 하나 더 있다. */
export function LoginForm({ mode, next = "" }: { mode: "login" | "signup"; next?: string }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState<LoginState, FormData>(isSignup ? signup : login, {});
  return (
    <form action={action} className="space-y-3">
      {!isSignup && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={isSignup ? PASSWORD_MIN_LENGTH : undefined}
          className="input"
        />
        {isSignup && <p className="mt-1 text-xs text-muted">{PASSWORD_MIN_LENGTH}자 이상</p>}
      </div>
      {isSignup && (
        <div>
          <label className="label" htmlFor="password-confirm">비밀번호 확인</label>
          <input
            id="password-confirm"
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            required
            className="input"
          />
        </div>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "확인 중…" : isSignup ? "가입하기" : "로그인"}
      </button>
      <p className="pt-1 text-center text-sm text-muted">
        {isSignup ? (
          <>
            이미 계정이 있나요? <Link href="/login" className="text-primary underline">로그인</Link>
          </>
        ) : (
          <>
            계정이 없나요? <Link href="/signup" className="text-primary underline">회원가입</Link>
          </>
        )}
      </p>
    </form>
  );
}
