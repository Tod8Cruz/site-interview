"use client";

import { useActionState, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { API_TOKEN_EXPIRY_DAYS } from "@/lib/validation";
import { issueApiToken, revokeApiToken, type ApiTokenFormState } from "./actions";

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expired: boolean;
};

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm shrink-0"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "복사됨" : label}
    </button>
  );
}

export function ApiTokens({ tokens, origin }: { tokens: ApiTokenRow[]; origin: string }) {
  const [state, action, pending] = useActionState<ApiTokenFormState, FormData>(issueApiToken, {});
  const docsUrl = `${origin}/api/v1/docs`;
  const aiInstructions = state.token
    ? `모의 면접 사이트의 예상 질문 API를 사용해 줘.\n- API 문서: ${docsUrl} (먼저 읽고 문서대로 호출)\n- 인증 헤더: Authorization: Bearer ${state.token}`
    : "";

  return (
    <div className="space-y-3">
      <form action={action} className="card flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-0 flex-1 basis-48">
          <label className="label" htmlFor="token-name">토큰 이름</label>
          <input id="token-name" name="name" required maxLength={100} className="input"
            placeholder="예: Claude 질문 정리용" />
        </div>
        <div>
          <label className="label" htmlFor="token-expires">만료</label>
          <select id="token-expires" name="expiresInDays" defaultValue="90" className="input w-auto">
            {API_TOKEN_EXPIRY_DAYS.map((d) => (
              <option key={d} value={d}>{d === 365 ? "1년" : `${d}일`}</option>
            ))}
            <option value="">만료 없음</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "발급 중…" : "토큰 발급"}</button>
        {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      </form>

      {state.token && (
        <div className="card space-y-3 border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-medium">
            ‘{state.name}’ 토큰을 발급했습니다. <span className="text-danger">이 화면을 떠나면 다시 볼 수 없으니</span> 지금 복사해 두세요.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs">
              {state.token}
            </code>
            <CopyButton text={state.token} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">AI에게 그대로 붙여 넣을 안내문</span>
              <CopyButton text={aiInstructions} label="안내문 복사" />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface p-3 text-xs">
              {aiInstructions}
            </pre>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">아직 발급한 토큰이 없습니다.</div>
      ) : (
        <ul className="card divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <span className="font-medium">{t.name}</span>
              <code className="font-mono text-xs text-muted">{t.prefix}…</code>
              {t.expired && <span className="chip bg-danger/15 text-danger">만료됨</span>}
              <span className="w-full text-xs text-muted sm:order-last">
                발급 {formatDateTime(t.createdAt)} · 만료 {t.expiresAt ? formatDateTime(t.expiresAt) : "없음"} · 마지막 사용{" "}
                {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "없음"}
              </span>
              <form
                action={revokeApiToken.bind(null, t.id)}
                className="ml-auto"
                onSubmit={(e) => {
                  if (!confirm(`‘${t.name}’ 토큰을 폐기할까요? 이 토큰을 쓰는 AI·스크립트는 바로 접근이 막힙니다.`)) e.preventDefault();
                }}
              >
                <button className="btn btn-sm">폐기</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
