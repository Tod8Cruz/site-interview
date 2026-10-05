"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Prompt } from "@/db/schema";
import { TEMPLATE_VARIABLES } from "@/lib/prompt-template";
import { VoiceOptions } from "@/components/voice-options";
import { VoicePreviewButton } from "@/components/voice-preview-button";
import { removePrompt, savePrompt, type PromptFormState } from "./actions";

export function PromptForm({ prompt }: { prompt?: Prompt }) {
  const save = savePrompt.bind(null, prompt?.id ?? null);
  const [state, action, pending] = useActionState<PromptFormState, FormData>(save, {});
  const [turnDetection, setTurnDetection] = useState(prompt?.turnDetection ?? "semantic_vad");
  const [voice, setVoice] = useState(prompt?.voice ?? "marin");

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="name">이름</label>
          <input id="name" name="name" required maxLength={100} defaultValue={prompt?.name} className="input"
            placeholder="예: 공채 인성 면접" />
        </div>
        <div>
          <label className="label" htmlFor="content">프롬프트</label>
          <textarea id="content" name="content" required rows={22} defaultValue={prompt?.content}
            className="input font-mono text-[13px] leading-relaxed" />
        </div>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "저장 중…" : "저장"}</button>
          <Link href="/prompts" className="btn">취소</Link>
          {prompt && (
            <button type="button" className="btn btn-danger ml-auto"
              onClick={async () => {
                if (confirm("이 프롬프트를 삭제할까요? 지난 면접 기록에는 영향이 없습니다.")) await removePrompt(prompt.id);
              }}>
              삭제
            </button>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">면접 설정</h2>
          <div>
            <label className="label" htmlFor="voice">면접관 목소리</label>
            <div className="flex gap-2">
              <select id="voice" name="voice" value={voice} onChange={(e) => setVoice(e.target.value)} className="input">
                <VoiceOptions />
              </select>
              <VoicePreviewButton voice={voice} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="maxMinutes">최대 시간(분)</label>
            <input id="maxMinutes" name="maxMinutes" type="number" min={1} max={60}
              defaultValue={prompt?.maxMinutes ?? 20} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="turnDetection">말 차례 판단</label>
            <select id="turnDetection" name="turnDetection" value={turnDetection}
              onChange={(e) => setTurnDetection(e.target.value as typeof turnDetection)} className="input">
              <option value="semantic_vad">의미 기반 (권장)</option>
              <option value="server_vad">침묵 시간 기반</option>
            </select>
          </div>
          {turnDetection === "semantic_vad" ? (
            <div>
              <label className="label" htmlFor="vadEagerness">기다림 정도</label>
              <select id="vadEagerness" name="vadEagerness" defaultValue={prompt?.vadEagerness ?? "low"} className="input">
                <option value="low">넉넉히 기다림 (최대 8초)</option>
                <option value="medium">보통 (최대 4초)</option>
                <option value="high">빨리 끼어듦 (최대 2초)</option>
                <option value="auto">자동</option>
              </select>
              <input type="hidden" name="silenceMs" value={prompt?.silenceMs ?? 1500} />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="silenceMs">침묵 허용(ms)</label>
              <input id="silenceMs" name="silenceMs" type="number" min={200} max={5000} step={100}
                defaultValue={prompt?.silenceMs ?? 1500} className="input" />
              <p className="mt-1 text-xs text-muted">이만큼 조용하면 답이 끝났다고 봅니다. 길수록 면접관 응답도 늦어집니다.</p>
              <input type="hidden" name="vadEagerness" value={prompt?.vadEagerness ?? "low"} />
            </div>
          )}
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold">템플릿 변수</h2>
          <ul className="space-y-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.name} className="text-xs">
                <code className="rounded bg-surface-2 px-1 py-0.5">{v.name}</code>
                <p className="mt-0.5 text-muted">{v.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </form>
  );
}
