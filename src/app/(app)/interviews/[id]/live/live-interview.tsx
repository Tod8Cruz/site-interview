"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadAudioDevices } from "@/lib/audio-devices";
import { isDesktopChrome } from "@/lib/browser";
import { formatDuration } from "@/lib/format";
import {
  InterviewSession,
  type EndResult,
  type SessionSnapshot,
} from "@/lib/realtime/interview-session";
import { downloadLocalRecording, uploadRecording } from "@/lib/recorder/upload";
import { Markdown } from "@/components/markdown";

const noop = () => () => {};

type Question = { id: string; question: string; modelAnswer: string };

type Props = {
  interviewId: string;
  title: string;
  maxMinutes: number;
  questions: Question[];
  alreadyStarted: boolean;
};

export function LiveInterview({ interviewId, title, maxMinutes, questions, alreadyStarted }: Props) {
  const router = useRouter();
  const supported = useSyncExternalStore(noop, isDesktopChrome, () => true);
  const sessionRef = useRef<InterviewSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [result, setResult] = useState<EndResult | null>(null);
  const [uploading, setUploading] = useState(false);
  /** 모범답안 모달에 띄운 질문 번호 (0부터). null이면 닫힘 */
  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const phase = snapshot?.phase ?? "idle";
  const active = phase === "connecting" || phase === "live";

  // R-9: 면접 중 페이지를 떠나려 하면 경고
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  useEffect(() => () => void sessionRef.current?.end("disconnected"), []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [snapshot?.turns]);

  async function start() {
    const session = new InterviewSession(interviewId, maxMinutes, questions, {
      onChange: setSnapshot,
      onEnded: (r) => {
        setResult(r);
        if (r.reason !== "disconnected" && r.reason !== "error" && r.upload.ok) router.push(`/interviews/${interviewId}`);
      },
    });
    sessionRef.current = session;
    await session.start(loadAudioDevices()).catch(() => {});
  }

  async function retryUpload() {
    setUploading(true);
    const upload = await uploadRecording(interviewId);
    setUploading(false);
    setResult((prev) => (prev ? { ...prev, upload } : prev));
    if (upload.ok) router.push(`/interviews/${interviewId}`);
  }

  const elapsed = snapshot?.elapsedMs ?? 0;
  const remaining = maxMinutes * 60_000 - elapsed;
  const hasSidebar = questions.length > 0;
  const currentIndex = snapshot?.currentQuestionIndex ?? null;
  const currentHasAnswer = currentIndex !== null && Boolean(questions[currentIndex]?.modelAnswer);

  if (!supported) {
    return (
      <Notice title="데스크톱 Chrome 전용입니다">
        모의 면접은 데스크톱 Chrome에서만 진행할 수 있습니다. 질문 목록과 다시 보기는 다른 기기에서도 볼 수 있습니다.
      </Notice>
    );
  }

  // R-10: 연결이 끊긴 뒤 다시 들어온 경우 — 재연결 대신 정리하고 새 면접을 권한다.
  if (alreadyStarted && phase === "idle") {
    return (
      <Notice title="이미 시작된 면접입니다">
        <p>이전 연결이 끊긴 것 같습니다. 재연결은 지원하지 않습니다. 지금까지의 대화는 저장되어 있습니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={async () => {
              await fetch(`/api/interviews/${interviewId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "aborted" }),
              });
              router.push(`/interviews/${interviewId}`);
            }}
          >
            중단 처리하고 다시 보기
          </button>
          <Link href={`/interviews?start=1&from=${interviewId}`} className="btn">같은 질문으로 새 면접</Link>
        </div>
      </Notice>
    );
  }

  if (result) {
    const disconnected = result.reason === "disconnected" || result.reason === "error";
    return (
      <Notice title={disconnected ? "연결이 끊겼습니다" : "면접이 끝났습니다"}>
        {disconnected && snapshot?.error && <p className="mb-2 text-danger">{snapshot.error}</p>}
        <p>
          {disconnected ? "지금까지의 대화와 녹음은 저장됩니다. " : ""}면접 길이 {formatDuration(result.durationMs)}.
        </p>
        {result.metrics.latencyP95 !== null && (
          <p className="mt-1 text-xs text-muted">
            응답 지연 p50 {(result.metrics.latencyP50! / 1000).toFixed(2)}초 · p95{" "}
            {(result.metrics.latencyP95 / 1000).toFixed(2)}초 ({result.metrics.latencySamples}회)
          </p>
        )}
        {!result.upload.ok && (
          <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="text-warning">녹음을 업로드하지 못했습니다: {result.upload.error}</p>
            <p className="mt-1 text-muted">녹음은 이 브라우저에 보관되어 있습니다. 다시 시도하거나 파일로 받으세요.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-sm" disabled={uploading} onClick={retryUpload}>
                {uploading ? "업로드 중…" : "업로드 다시 시도"}
              </button>
              <button className="btn btn-sm" onClick={() => downloadLocalRecording(interviewId)}>파일로 받기</button>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/interviews/${interviewId}`} className="btn btn-primary">다시 보기로 이동</Link>
          <Link href={`/interviews?start=1&from=${interviewId}`} className="btn">같은 질문으로 새 면접</Link>
        </div>
      </Notice>
    );
  }

  return (
    <div className={hasSidebar ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" : "mx-auto max-w-3xl"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:col-span-full">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted">최대 {maxMinutes}분</p>
        </div>
        {phase === "live" && (
          <div className="flex items-center gap-3 tabular-nums">
            <span className="text-sm">{formatDuration(elapsed)}</span>
            <span className={`text-sm ${remaining <= 60_000 ? "font-semibold text-danger" : "text-muted"}`}>
              남은 시간 {formatDuration(remaining)}
            </span>
          </div>
        )}
      </div>

      <div>
        {phase === "idle" && (
          <div className="card space-y-3 p-6 text-sm">
            <p className="font-medium">시작하기 전에</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>조용한 곳에서 이어폰을 쓰면 가장 깨끗하게 녹음됩니다.</li>
              <li>시작하면 마이크 권한을 묻습니다. 허용해 주세요.</li>
              <li>면접관이 먼저 인사합니다. 생각할 때 잠시 멈춰도 괜찮습니다.</li>
            <li>면접관이 말하는 동안은 마이크가 자동으로 꺼집니다. 말이 끝난 뒤 답하세요.</li>
              <li>음성 인식은 &ldquo;어, 음&rdquo; 같은 군말을 지울 수 있습니다. 말버릇은 녹음으로 확인하세요.</li>
            </ul>
            <button className="btn btn-primary w-full py-3 text-base" onClick={start}>면접 시작</button>
          </div>
        )}

        {phase !== "idle" && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Speaker label="면접관" active={Boolean(snapshot?.interviewerSpeaking)} />
              <Speaker
              label="나"
              active={Boolean(snapshot?.candidateSpeaking)}
              muted={snapshot?.muted}
              gated={phase === "live" && !snapshot?.muted && !snapshot?.micOpen}
            />
            </div>
            {phase === "connecting" && <p className="mb-3 text-sm text-muted">연결 중…</p>}
            {phase === "ending" && <p className="mb-3 text-sm text-muted">면접을 마무리하고 녹음을 저장하는 중…</p>}
            {remaining <= 60_000 && phase === "live" && (
              <p className="mb-3 rounded-lg bg-warning/10 p-2 text-sm text-warning">1분 남았습니다. 면접관이 곧 마무리합니다.</p>
            )}
            {snapshot?.error && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-sm text-danger">{snapshot.error}</p>}
            <div className="card h-[50vh] overflow-y-auto p-4">
              {snapshot?.turns.length ? (
                <ol className="space-y-3">
                  {snapshot.turns.map((t) => (
                    <li key={t.key} className={t.role === "candidate" ? "flex justify-end" : ""}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        t.role === "candidate" ? "bg-primary/10" : "bg-surface-2"} ${t.final ? "" : "opacity-70"}`}>
                        <p className="mb-0.5 text-[11px] text-muted">
                          {t.role === "candidate" ? "나" : "면접관"} · {formatDuration(t.startMs)}
                          {t.interrupted && " · 끊김"}
                        </p>
                        <p className="whitespace-pre-wrap">{t.text || "…"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">대화가 여기에 표시됩니다.</p>
              )}
              <div ref={transcriptEnd} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn" disabled={phase !== "live"}
                onClick={() => sessionRef.current?.setMuted(!snapshot?.muted)}>
                {snapshot?.muted ? "마이크 켜기" : "마이크 음소거"}
              </button>
              {hasSidebar && (
                <button
                  className="btn"
                  disabled={!currentHasAnswer}
                  title={currentIndex === null ? "아직 질문 목록의 질문이 시작되지 않았습니다" : undefined}
                  onClick={() => setAnswerIndex(currentIndex)}
                >
                  현재 질문 모범답안
                </button>
              )}
              <button className="btn btn-danger ml-auto" disabled={!active}
                onClick={() => {
                  if (confirm("면접을 종료할까요?")) void sessionRef.current?.end("user");
                }}>
                면접 종료
              </button>
            </div>
          </>
        )}

        {hasSidebar && answerIndex !== null && (
          <ModelAnswerPanel
            questions={questions}
            index={answerIndex}
            current={currentIndex}
            onChange={setAnswerIndex}
          />
        )}
      </div>

      {hasSidebar && (
        <aside className="self-start lg:sticky lg:top-20">
          <QuestionList
            questions={questions}
            current={currentIndex}
            started={phase !== "idle"}
            wrapUp={Boolean(snapshot?.wrapUpSent)}
            onShowAnswer={setAnswerIndex}
          />
        </aside>
      )}
    </div>
  );
}

/**
 * 대화 영역 아래에 펼쳐지는 모범답안 패널. 모달이 아니라서 면접 화면을 가리지 않고, 세션도 그대로 흐른다.
 * 이전/다음으로 다른 질문의 답안도 넘겨 볼 수 있고, 숨기기로 접는다.
 */
function ModelAnswerPanel({
  questions,
  index,
  current,
  onChange,
}: {
  questions: Question[];
  index: number;
  current: number | null;
  onChange: (index: number | null) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 처음 열릴 때 패널이 보이도록 스크롤하고, 다른 질문으로 넘기면 본문을 맨 위로 되돌린다.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  const question = questions[index];
  if (!question) return null;

  return (
    <section ref={panelRef} aria-labelledby="model-answer-title" className="card mt-4 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-xs text-muted">
            모범답안 · {index + 1}/{questions.length}
            {current === index && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-primary">진행 중</span>}
          </p>
          <h2 id="model-answer-title" className="text-sm font-semibold">{question.question}</h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="btn btn-sm" disabled={index <= 0} onClick={() => onChange(index - 1)} aria-label="이전 질문 답안">←</button>
          <button className="btn btn-sm" disabled={index >= questions.length - 1} onClick={() => onChange(index + 1)} aria-label="다음 질문 답안">→</button>
          <button className="btn btn-sm" onClick={() => onChange(null)}>숨기기</button>
        </div>
      </div>
      <div ref={bodyRef} className="max-h-[40vh] overflow-y-auto px-4 py-3">
        {question.modelAnswer ? (
          <Markdown>{question.modelAnswer}</Markdown>
        ) : (
          <p className="text-sm text-muted">모범답안이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

type StepState = "done" | "current" | "upcoming";

/** 사이드바: 인사 → 질문 1..N → 마무리 순서로 진행 상태를 보여 주고, 질문마다 모범답안을 열 수 있다. */
function QuestionList({
  questions,
  current,
  started,
  wrapUp,
  onShowAnswer,
}: {
  questions: Question[];
  current: number | null;
  started: boolean;
  wrapUp: boolean;
  onShowAnswer: (index: number) => void;
}) {
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [current, wrapUp]);

  const done = current === null ? 0 : Math.min(questions.length, current + (wrapUp ? 1 : 0));
  const steps: { key: string; label: string; state: StepState; answerIndex?: number }[] = [
    {
      key: "intro",
      label: "인사 · 자기소개",
      state: !started ? "upcoming" : current === null && !wrapUp ? "current" : "done",
    },
    ...questions.map((q, i) => ({
      key: q.id,
      label: q.question,
      answerIndex: q.modelAnswer ? i : undefined,
      state: (current === null || !started
        ? "upcoming"
        : i < current || (wrapUp && i === current)
          ? "done"
          : i === current
            ? "current"
            : "upcoming") as StepState,
    })),
    { key: "outro", label: "마무리", state: wrapUp ? "current" : "upcoming" },
  ];

  return (
    <div className="card p-3">
      <p className="mb-2 flex items-baseline justify-between text-sm font-medium">
        <span>질문 진행</span>
        <span className="text-xs text-muted tabular-nums">{done}/{questions.length}</span>
      </p>
      <p className="mb-2 text-[11px] text-muted">
        질문 옆 <span className="font-medium">답안</span>을 누르면 대화 아래에 모범답안이 펼쳐집니다.
      </p>
      <ol className="max-h-[60vh] space-y-1 overflow-y-auto text-sm">
        {steps.map((step, i) => {
          const number = i === 0 || i === steps.length - 1 ? "" : `${i}. `;
          return (
            <li
              key={step.key}
              ref={step.state === "current" ? currentRef : undefined}
              aria-current={step.state === "current" ? "step" : undefined}
              className={`flex gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                step.state === "current"
                  ? "border-primary bg-primary/10 font-medium"
                  : step.state === "done"
                    ? "border-transparent text-muted"
                    : "border-transparent"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-xs leading-5">
                {step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}
              </span>
              <span className={`min-w-0 flex-1 line-clamp-2 ${step.state === "done" ? "line-through decoration-border" : ""}`}>
                {number}
                {step.label}
              </span>
              {step.answerIndex !== undefined && (
                <button
                  type="button"
                  className="shrink-0 self-start rounded px-1 text-[11px] font-normal text-primary underline-offset-2 hover:underline"
                  aria-label={`${step.answerIndex + 1}번 질문 모범답안 보기`}
                  onClick={() => onShowAnswer(step.answerIndex!)}
                >
                  답안
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Speaker({
  label,
  active,
  muted,
  gated,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
  /** 면접관이 말하는 동안 자동으로 닫힌 상태 */
  gated?: boolean;
}) {
  return (
    <div className={`card flex items-center gap-2 p-3 transition-colors ${active ? "border-primary" : ""}`}>
      <span className={`size-2.5 rounded-full ${active ? "animate-pulse bg-primary" : gated ? "bg-warning" : "bg-border"}`} />
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted">
        {muted ? "음소거" : active ? "말하는 중" : gated ? "면접관 발언 중 · 마이크 꺼짐" : ""}
      </span>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-xl p-6 text-sm">
      <h1 className="mb-2 text-lg font-semibold">{title}</h1>
      {children}
    </div>
  );
}
