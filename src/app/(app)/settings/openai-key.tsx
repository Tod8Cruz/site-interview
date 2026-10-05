"use client";

import { useActionState } from "react";
import { formatDateTime } from "@/lib/format";
import type { OpenAIKeyStatus } from "@/server/settings";
import { removeOpenAIKey, saveOpenAIKey, type OpenAIKeyFormState } from "./actions";

/** 설정 > OpenAI API 키. 키 원문은 저장 뒤 다시 보여 주지 않고 앞뒤 몇 글자만 표시한다. */
export function OpenAIKey({ status }: { status: OpenAIKeyStatus }) {
  const [state, action, pending] = useActionState<OpenAIKeyFormState, FormData>(saveOpenAIKey, {});

  return (
    <div className="space-y-3">
      <div className="card p-4 text-sm">
        {status.source === "settings" && (
          <p>
            <span className="chip mr-2 bg-success/15 text-success">등록됨</span>
            <code className="font-mono text-xs">{status.hint}</code>
            {status.updatedAt && <span className="ml-2 text-xs text-muted">저장 {formatDateTime(status.updatedAt)}</span>}
          </p>
        )}
        {status.source === "env" && (
          <p>
            <span className="chip mr-2 bg-warning/15 text-warning">환경변수 사용 중</span>
            <code className="font-mono text-xs">{status.hint}</code>
            <span className="ml-2 text-xs text-muted">
              서버의 OPENAI_API_KEY를 쓰고 있습니다. 아래에 키를 등록하면 그 키가 우선합니다.
            </span>
          </p>
        )}
        {status.unreadable && (
          <p className="text-danger">
            저장된 키를 읽을 수 없습니다. 서버의 SESSION_SECRET이 바뀐 것 같으니 키를 다시 등록해 주세요.
          </p>
        )}
        {status.source === null && !status.unreadable && (
          <p className="text-muted">아직 등록된 키가 없습니다. 키가 없으면 모의 면접을 시작할 수 없습니다.</p>
        )}
      </div>

      <form action={action} className="card flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <label className="label" htmlFor="openai-key">
            {status.source === "settings" ? "새 키로 바꾸기" : "API 키"}
          </label>
          <input
            id="openai-key"
            name="apiKey"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className="input font-mono"
            placeholder="sk-proj-…"
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "확인 중…" : "저장"}
        </button>
        {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
        {state.saved && <p className="w-full text-sm text-success">키를 저장했습니다 ({state.saved}).</p>}
        <p className="w-full text-xs text-muted">
          저장 전에 OpenAI에 키가 동작하는지 확인합니다. 키는 서버에서 암호화해 보관하고 브라우저에는 내려보내지
          않습니다. 키는{" "}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">
            OpenAI 대시보드
          </a>
          에서 만들고, 이 앱 전용 프로젝트에 월 예산 한도를 걸어 두세요.
        </p>
      </form>

      {(status.source === "settings" || status.unreadable) && (
        <form
          action={removeOpenAIKey}
          onSubmit={(e) => {
            if (!confirm("등록한 OpenAI API 키를 삭제할까요? 삭제하면 모의 면접을 시작할 수 없습니다.")) e.preventDefault();
          }}
        >
          <button className="btn btn-sm">등록한 키 삭제</button>
        </form>
      )}
    </div>
  );
}
