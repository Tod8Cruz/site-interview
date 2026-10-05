"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AudioStatus } from "@/db/schema";
import { formatDuration } from "@/lib/format";
import { loadRecording } from "@/lib/recorder/chunk-store";
import { makeSeekable } from "@/lib/recorder/seekable";
import { downloadLocalRecording, uploadRecording } from "@/lib/recorder/upload";
import {
  answerMetrics,
  suggestQuestion,
  transcriptMarkdown,
  type AnswerMetrics,
  type ReviewQuestion,
  type ReviewTurn,
} from "@/lib/review";

type Props = {
  interviewId: string;
  title: string;
  audioUrl: string | null;
  audioStatus: AudioStatus;
  turns: ReviewTurn[];
  questions: ReviewQuestion[];
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const RATES = [1, 1.25, 1.5, 2];
const average =(values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function Replay({ interviewId, title, audioUrl, audioStatus, turns: initialTurns, questions }: Props) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [turns, setTurns] = useState(initialTurns);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [hasLocal, setHasLocal] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [uploadState, setUploadState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [copied, setCopied] = useState(false);

  // 업로드 전이면 이 브라우저에 남은 녹음(IndexedDB)으로 재생한다.
  useEffect(() => {
    if (audioUrl) return;
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      const stored = await loadRecording(interviewId).catch(() => null);
      if (!stored || cancelled) return;
      const file = await makeSeekable(stored.blob).catch(() => stored.blob);
      if (cancelled) return;
      url = URL.createObjectURL(file);
      setLocalUrl(url);
      setHasLocal(true);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioUrl, interviewId]);

  const src = audioUrl ?? localUrl;
  const metrics = useMemo(() => answerMetrics(turns), [turns]);

  const summary = useMemo(() => {
    const answers = metrics.filter((m): m is AnswerMetrics => m !== null);
    return {
      count: answers.length,
      avgDuration: average(answers.flatMap((m) => (m.durationMs !== null ? [m.durationMs] : []))),
      avgFirstWord: average(answers.flatMap((m) => (m.firstWordMs !== null ? [m.firstWordMs] : []))),
      notes: turns.filter((t) => t.note).length,
    };
  }, [metrics, turns]);

  const notedQuestionIds = useMemo(
    () => Array.from(new Set(turns.filter((t) => t.note && t.noteQuestionId).map((t) => t.noteQuestionId!))),
    [turns],
  );

  const currentId = useMemo(() => {
    let found: string | null = null;
    for (const t of turns) {
      if (t.startMs <= currentMs + 150) found = t.id;
      else break;
    }
    return found;
  }, [turns, currentMs]);

  function seek(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    void audio.play();
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    if (audioRef.current) audioRef.current.playbackRate = next;
    setRate(next);
  }

  async function retryUpload() {
    setUploadState({ busy: true });
    const result = await uploadRecording(interviewId);
    if (result.ok) {
      setUploadState({ busy: false });
      router.refresh();
    } else setUploadState({ busy: false, error: result.error });
  }

  function exportMarkdown(mode: "copy" | "download") {
    const markdown = transcriptMarkdown(title, turns, questions);
    if (mode === "copy") {
      void navigator.clipboard.writeText(markdown).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const updateTurn = (id: string, patch: Partial<ReviewTurn>) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-4">
      <div className="card sticky top-16 z-[5] p-3">
        {src ? (
          <div className="flex items-center gap-3 rounded-full bg-surface-2 px-3 py-2">
            <audio
              ref={audioRef}
              src={src}
              preload="metadata"
              onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
              onDurationChange={(e) => {
                const d = e.currentTarget.duration;
                setDurationMs(Number.isFinite(d) ? d * 1000 : 0);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <button
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg hover:opacity-90"
              onClick={togglePlay}
              aria-label={playing ? "일시정지" : "재생"}
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
                {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4.5 2.5v11l9-5.5z" />}
              </svg>
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {formatDuration(currentMs)} / {formatDuration(durationMs)}
            </span>
            <input
              type="range"
              className="seek"
              min={0}
              max={durationMs || 1}
              step={100}
              value={Math.min(currentMs, durationMs)}
              disabled={!durationMs}
              onChange={(e) => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = Number(e.target.value) / 1000;
              }}
              style={{ "--progress": `${durationMs ? (currentMs / durationMs) * 100 : 0}%` } as CSSProperties}
              aria-label="재생 위치"
            />
            <button className="btn btn-sm shrink-0 tabular-nums" onClick={cycleRate} aria-label="재생 속도">
              {rate}x
            </button>
          </div>
        ) : (
          <p className="p-2 text-sm text-muted">
            {audioStatus === "none" ? "이 면접에는 녹음이 없습니다." : "녹음을 찾는 중이거나 이 브라우저에 없습니다."}
          </p>
        )}
        {!audioUrl && hasLocal && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-warning">이 브라우저에 보관된 녹음입니다. 아직 업로드되지 않았습니다.</span>
            <button className="btn btn-sm" disabled={uploadState.busy} onClick={retryUpload}>
              {uploadState.busy ? "업로드 중…" : "업로드"}
            </button>
            <button className="btn btn-sm" onClick={() => downloadLocalRecording(interviewId)}>파일로 받기</button>
            {uploadState.error && <span className="text-danger">{uploadState.error}</span>}
          </div>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <dl className="card grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
          <Stat label="답변" value={`${summary.count}개`} />
          <Stat label="평균 답변 길이" value={summary.avgDuration !== null ? formatDuration(summary.avgDuration) : "-"} />
          <Stat label="평균 첫마디까지" value={summary.avgFirstWord !== null ? seconds(summary.avgFirstWord) : "-"} />
          <Stat label="메모" value={`${summary.notes}개`} />
        </dl>
        <div className="card flex flex-col justify-center gap-2 p-4">
          <p className="text-xs font-medium text-muted">다시 연습하기</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/interviews?start=1&from=${interviewId}`} className="btn btn-sm">전체 질문으로</Link>
            {notedQuestionIds.length ? (
              <Link href={`/interviews?start=1&from=${interviewId}&only=noted`} className="btn btn-sm btn-primary">
                메모한 질문만 ({notedQuestionIds.length})
              </Link>
            ) : (
              <span className="btn btn-sm pointer-events-none opacity-50" title="메모에 질문을 연결하면 그 질문만 다시 연습할 수 있습니다.">
                메모한 질문만 (0)
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">발화를 누르면 그 지점부터 재생합니다. 말버릇(“어, 음”)은 녹음으로 확인하세요.</p>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => exportMarkdown("copy")} disabled={!turns.length}>
            {copied ? "복사됨" : "기록 복사"}
          </button>
          <button className="btn btn-sm" onClick={() => exportMarkdown("download")} disabled={!turns.length}>
            마크다운 받기
          </button>
        </div>
      </div>

      {turns.length === 0 ? (
        <p className="card p-6 text-sm text-muted">저장된 대화가 없습니다.</p>
      ) : (
        <ol className="space-y-2">
          {turns.map((t, i) => (
            <TurnCard
              key={t.id}
              interviewId={interviewId}
              turn={t}
              metrics={metrics[i]}
              current={t.id === currentId}
              canSeek={Boolean(src)}
              questions={questions}
              suggestedQuestionId={() => suggestQuestion(turns, i, questions)}
              onSeek={() => seek(t.startMs)}
              onSaved={(patch) => updateTurn(t.id, patch)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function TurnCard({
  interviewId,
  turn,
  metrics,
  current,
  canSeek,
  questions,
  suggestedQuestionId,
  onSeek,
  onSaved,
}: {
  interviewId: string;
  turn: ReviewTurn;
  metrics: AnswerMetrics | null;
  current: boolean;
  canSeek: boolean;
  questions: ReviewQuestion[];
  suggestedQuestionId: () => string | null;
  onSeek: () => void;
  onSaved: (patch: Partial<ReviewTurn>) => void;
}) {
  const [open, setOpen] = useState(Boolean(turn.note));
  const [note, setNote] = useState(turn.note ?? "");
  const [questionId, setQuestionId] = useState(turn.noteQuestionId ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 디바운스 저장이 최신 값을 읽도록 이벤트 핸들러에서 갱신한다.
  const latest = useRef({ note, questionId });

  async function save() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = { note: latest.current.note, noteQuestionId: latest.current.questionId || null };
    setSaveState("saving");
    const response = await fetch(`/api/interviews/${interviewId}/turns/${turn.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      setSaveState("saved");
      onSaved({ note: body.note.trim() ? body.note : null, noteQuestionId: body.noteQuestionId });
    } else setSaveState("error");
  }

  const scheduleSave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  };

  function openNote() {
    if (!questionId) {
      const suggested = suggestedQuestionId() ?? "";
      setQuestionId(suggested);
      latest.current.questionId = suggested;
    }
    setOpen(true);
  }

  return (
    <li
      className={`card transition-colors ${current ? "border-primary ring-2 ring-primary/20" : ""} ${
        turn.role === "candidate" ? "border-l-4 border-l-primary" : ""
      }`}
    >
      <div className="flex items-start gap-2 p-3">
        <button onClick={onSeek} disabled={!canSeek} className="min-w-0 flex-1 text-left">
          <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="font-medium text-text">{turn.role === "candidate" ? "나" : "면접관"}</span>
            <span className="tabular-nums">{formatDuration(turn.startMs)}</span>
            {metrics?.durationMs != null && <span className="tabular-nums">· 답변 {formatDuration(metrics.durationMs)}</span>}
            {metrics?.firstWordMs != null && (
              <span className={`tabular-nums ${metrics.firstWordMs >= 5000 ? "text-warning" : ""}`}>
                · 첫마디까지 {seconds(metrics.firstWordMs)}
              </span>
            )}
            {turn.interrupted && <span className="chip">끊김</span>}
          </p>
          <p className="whitespace-pre-wrap text-sm">{turn.text}</p>
        </button>
        {!open && (
          <button className="btn btn-sm shrink-0" onClick={openNote}>메모</button>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-border bg-surface-2/50 px-3 py-2">
          <textarea
            value={note}
            rows={2}
            maxLength={5000}
            placeholder="예) 결론부터 말하기, '어' 줄이기, 수치 근거 추가"
            onChange={(e) => {
              setNote(e.target.value);
              latest.current.note = e.target.value;
              scheduleSave();
            }}
            onBlur={() => timer.current && void save()}
            className="input"
            aria-label="메모"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-muted" htmlFor={`q-${turn.id}`}>연결 질문</label>
            <select
              id={`q-${turn.id}`}
              value={questionId}
              onChange={(e) => {
                setQuestionId(e.target.value);
                latest.current.questionId = e.target.value;
                void save();
              }}
              className="input w-auto max-w-full flex-1 py-1 text-xs"
            >
              <option value="">연결 안 함</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>{q.question}</option>
              ))}
            </select>
            <span className={`ml-auto ${saveState === "error" ? "text-danger" : "text-muted"}`}>
              {{ idle: "", saving: "저장 중…", saved: "저장됨", error: "저장 실패" }[saveState]}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
