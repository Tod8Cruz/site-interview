"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CandidateProfile, Prompt } from "@/db/schema";
import { isDesktopChrome } from "@/lib/browser";
import { VoiceOptions } from "@/components/voice-options";
import { VoicePreviewButton } from "@/components/voice-preview-button";
import { AudioDeviceCheck } from "@/components/audio-device-check";

type QuestionOption = { id: string; groupId: string; question: string };
type GroupOption = { id: string; name: string; isDefault: boolean };
type Mode = "all" | "manual" | "random";

export type StartPrefill = {
  sourceInterviewId: string;
  sourceTitle: string;
  promptId: string | null;
  candidateProfileId: string | null;
  questionIds: string[];
  notedOnly: boolean;
};

type Props = {
  prompts: Prompt[];
  profiles: CandidateProfile[];
  groups: GroupOption[];
  questions: QuestionOption[];
  prefill: StartPrefill | null;
  autoOpen: boolean;
  label?: string;
  className?: string;
};

const noop = () => () => {};

function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 면접 시작 버튼 + 옵션 선택 모달 (N-1~N-5) */
export function StartInterview({ autoOpen, label = "면접 시작", className = "btn btn-primary", ...props }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 모달이 열려 있는 동안만 마이크를 잡아 둔다.
  const [open, setOpen] = useState(autoOpen);

  function show() {
    dialogRef.current?.showModal();
    setOpen(true);
  }

  useEffect(() => {
    if (autoOpen) dialogRef.current?.showModal();
  }, [autoOpen]);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button className={className} onClick={show}>{label}</button>
      <dialog
        ref={dialogRef}
        aria-labelledby="start-interview-title"
        onClose={() => {
          setOpen(false);
          // 재면접 링크(?start=1&from=…)로 열렸다면 닫을 때 주소를 정리한다.
          if (autoOpen) router.replace("/interviews", { scroll: false });
        }}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto max-h-[90dvh] w-[min(44rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40"
      >
        <StartForm key={props.prefill?.sourceInterviewId ?? "new"} {...props} open={open} onCancel={close} />
      </dialog>
    </>
  );
}

function StartForm({
  prompts,
  profiles,
  groups,
  questions: allQuestions,
  prefill,
  open,
  onCancel,
}: Omit<Props, "autoOpen"> & { open: boolean; onCancel: () => void }) {
  const router = useRouter();
  const supported = useSyncExternalStore(noop, isDesktopChrome, () => true);

  const defaultPrompt =
    prompts.find((p) => p.id === prefill?.promptId) ?? prompts.find((p) => p.isDefault) ?? prompts[0];
  const defaultProfile =
    profiles.find((p) => p.id === prefill?.candidateProfileId) ?? profiles.find((p) => p.isDefault);

  const [profileId, setProfileId] = useState(defaultProfile?.id ?? "");
  const profile = profiles.find((p) => p.id === profileId);
  const [promptId, setPromptId] = useState(defaultPrompt?.id ?? "");
  const prompt = prompts.find((p) => p.id === promptId);
  const [voice, setVoice] = useState(defaultPrompt?.voice ?? "marin");
  const [maxMinutes, setMaxMinutes] = useState(defaultPrompt?.maxMinutes ?? 20);
  // 다시 면접할 때는 원래 질문이 들어 있는 그룹을 고른다.
  const prefillGroupId = allQuestions.find((q) => q.id === prefill?.questionIds[0])?.groupId;
  const [groupId, setGroupId] = useState(
    prefillGroupId ?? groups.find((g) => g.isDefault)?.id ?? groups[0]?.id ?? "",
  );
  const questions = useMemo(() => allQuestions.filter((q) => q.groupId === groupId), [allQuestions, groupId]);
  const [mode, setMode] = useState<Mode>(prefill ? "manual" : "all");
  const [randomCount, setRandomCount] = useState(5);
  const [manual, setManual] = useState<Set<string>>(new Set(prefill?.questionIds ?? []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);

  const pickGroup = (id: string) => {
    setGroupId(id);
    // 직접 고른 질문은 그룹마다 따로라 그룹을 바꾸면 비운다.
    setManual(new Set());
  };

  const pickPrompt = (id: string) => {
    setPromptId(id);
    const next = prompts.find((p) => p.id === id);
    if (next) {
      setVoice(next.voice);
      setMaxMinutes(next.maxMinutes);
    }
  };

  const selectedIds = (): string[] => {
    switch (mode) {
      case "all":
        return questions.map((q) => q.id);
      case "manual":
        return questions.filter((q) => manual.has(q.id)).map((q) => q.id);
      case "random":
        return shuffle(questions).slice(0, randomCount).map((q) => q.id);
    }
  };

  const previewCount =
    mode === "all"
      ? questions.length
      : mode === "manual"
        ? questions.filter((q) => manual.has(q.id)).length
        : Math.min(randomCount, questions.length);

  async function start() {
    setSubmitting(true);
    setError(null);
    setConflictId(null);
    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId,
          candidateProfileId: profileId || null,
          questionIds: selectedIds(),
          voice,
          maxMinutes,
          sourceInterviewId: prefill?.sourceInterviewId ?? null,
        }),
      });
      const body = (await response.json()) as { id?: string; error?: { message: string; interviewId?: string } };
      if (response.status === 409 && body.error?.interviewId) {
        setConflictId(body.error.interviewId);
        setError(body.error.message);
        return;
      }
      if (!response.ok || !body.id) throw new Error(body.error?.message ?? "면접을 만들지 못했습니다.");
      router.push(`/interviews/${body.id}/live`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  /** 진행 중인 면접을 일시정지로 돌린다(나중에 이어할 수 있다). 진행 시간은 서버가 턴 기록으로 추정한다. */
  async function pauseRunning() {
    if (!conflictId) return;
    await fetch(`/api/interviews/${conflictId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    setConflictId(null);
    setError(null);
    router.refresh();
  }

  return (
    <form
      method="dialog"
      className="flex max-h-[90dvh] flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <header className="border-b border-border px-5 py-4">
        <h2 id="start-interview-title" className="text-lg font-semibold">면접 시작</h2>
        <p className="mt-0.5 text-sm text-muted">
          {prefill
            ? prefill.notedOnly
              ? `"${prefill.sourceTitle}"에서 메모한 질문 ${prefill.questionIds.length}개만 다시 연습합니다.`
              : `"${prefill.sourceTitle}"의 설정으로 다시 면접합니다.`
            : "지원자 정보와 면접관, 질문 그룹을 고르세요."}
        </p>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0" htmlFor="profile">지원자 정보</label>
            <Link href="/profiles" className="text-xs text-primary underline">관리</Link>
          </div>
          {profiles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
              저장된 지원자 정보가 없습니다. <Link href="/profiles/new" className="text-primary underline">지원자 정보 메뉴에서 추가</Link>하면
              면접관이 그 내용으로 질문합니다. 없이도 시작할 수 있습니다.
            </p>
          ) : (
            <>
              <select id="profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="input">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (기본값)" : ""}</option>
                ))}
                <option value="">지원자 정보 없이</option>
              </select>
              {profile && (
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                  {profile.content}
                </p>
              )}
            </>
          )}
        </section>

        <section>
          <label className="label" htmlFor="prompt">면접관</label>
          <select id="prompt" value={promptId} onChange={(e) => pickPrompt(e.target.value)} className="input">
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (기본값)" : ""}</option>
            ))}
          </select>
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0" htmlFor="questionGroup">질문 그룹</label>
            <Link href="/questions" className="text-xs text-primary underline">관리</Link>
          </div>
          <select id="questionGroup" value={groupId} onChange={(e) => pickGroup(e.target.value)} className="input">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}{g.isDefault ? " (기본)" : ""} · {allQuestions.filter((q) => q.groupId === g.id).length}개
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="질문 고르는 방식">
            {([
              ["all", "전체 질문"],
              ["manual", "직접 고르기"],
              ["random", "무작위"],
            ] as const).map(([value, text]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
                className={`btn btn-sm ${mode === value ? "border-primary text-primary" : ""}`}>
                {text}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {mode === "random" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="number" min={1} max={Math.max(1, questions.length)} value={randomCount}
                  onChange={(e) => setRandomCount(Number(e.target.value))} className="input w-24" />
                개를 시작할 때 무작위로 뽑습니다.
              </label>
            )}
            {mode === "manual" && questions.length > 0 && (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {questions.map((q) => (
                  <li key={q.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-2">
                      <input type="checkbox" className="mt-1" checked={manual.has(q.id)}
                        onChange={(e) => {
                          const next = new Set(manual);
                          if (e.target.checked) next.add(q.id);
                          else next.delete(q.id);
                          setManual(next);
                        }} />
                      <span>{q.question}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            {previewCount}개 질문 사용{questions.length === 0 && " — 이 그룹에 질문이 없으면 면접관이 지원자 정보로 질문을 만듭니다."}
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="voice">목소리</label>
            <div className="flex gap-2">
              <select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)} className="input">
                <VoiceOptions />
              </select>
              <VoicePreviewButton voice={voice} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="maxMinutes">최대 시간(분)</label>
            <input id="maxMinutes" type="number" min={1} max={60} value={maxMinutes}
              onChange={(e) => setMaxMinutes(Number(e.target.value))} className="input" />
          </div>
          {prompt && (
            <p className="text-xs text-muted sm:col-span-2">
              말 차례 판단: {prompt.turnDetection === "semantic_vad" ? `의미 기반(${prompt.vadEagerness})` : `침묵 ${prompt.silenceMs}ms`}
              {" · "}이어폰을 쓰면 면접관 목소리가 마이크로 다시 들어가지 않습니다.
            </p>
          )}
        </section>

        {open && supported && <AudioDeviceCheck voice={voice} />}

        {!supported && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            모의 면접은 데스크톱 Chrome 전용입니다. Chrome에서 열어 주세요.
          </p>
        )}
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            <p>{error}</p>
            {conflictId && (
              <div className="mt-2 flex gap-2">
                <a href={`/interviews/${conflictId}/live`} className="btn btn-sm">진행 중인 면접으로</a>
                <button type="button" className="btn btn-sm" onClick={pauseRunning}>그 면접 일시정지</button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" className="btn" onClick={onCancel}>취소</button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!supported || submitting || !promptId}
        >
          {submitting ? "준비 중…" : "면접 준비하기"}
        </button>
      </footer>
    </form>
  );
}
