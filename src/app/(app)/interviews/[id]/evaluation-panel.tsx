"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { criterionAverages, type EvaluationResult, type RubricCriterion } from "@/lib/evaluation";

export type EvaluationView = {
  rubricName: string;
  criteria: RubricCriterion[];
  model: string;
  result: EvaluationResult;
  /** 표시용 평가 시각 */
  evaluatedAt: string;
};

type Props = {
  interviewId: string;
  /** 끝난 면접이고 지원자 답변이 있을 때만 평가할 수 있다 */
  canEvaluate: boolean;
  blockedReason: string | null;
  openaiConfigured: boolean;
  rubrics: { id: string; name: string; isDefault: boolean }[];
  evaluation: EvaluationView | null;
};

const SCORE_TONE = (score: number) => (score >= 4 ? "bg-success" : score <= 2 ? "bg-danger" : "bg-primary");

export function EvaluationPanel({ interviewId, canEvaluate, blockedReason, openaiConfigured, rubrics, evaluation }: Props) {
  const router = useRouter();
  const [rubricId, setRubricId] = useState(rubrics.find((r) => r.isDefault)?.id ?? rubrics[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/interviews/${interviewId}/evaluation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rubricId: rubricId || null }),
    }).catch(() => null);
    if (response?.ok) {
      router.refresh();
    } else {
      const body = await response?.json().catch(() => null);
      setError(body?.error?.message ?? "평가 요청에 실패했습니다. 네트워크를 확인해 주세요.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!confirm("이 평가 결과를 삭제할까요?")) return;
    setBusy(true);
    const response = await fetch(`/api/interviews/${interviewId}/evaluation`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) router.refresh();
    else setError("삭제에 실패했습니다.");
    setBusy(false);
  }

  const disabled = !canEvaluate || !openaiConfigured || busy || !rubricId;

  return (
    <section className="card mt-4 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold">AI 평가</h2>
        {evaluation && (
          <p className="text-xs text-muted">
            기준: {evaluation.rubricName} · {evaluation.model} · {evaluation.evaluatedAt}
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={rubricId}
            onChange={(e) => setRubricId(e.target.value)}
            className="input w-auto py-1 text-xs"
            aria-label="평가 기준"
            disabled={busy}
          >
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.isDefault ? " (기본값)" : ""}</option>
            ))}
          </select>
          <button className="btn btn-sm btn-primary" disabled={disabled} title={blockedReason ?? undefined} onClick={run}>
            {busy ? "평가 중… (약 30초)" : evaluation ? "다시 평가" : "AI 평가 실행"}
          </button>
          {evaluation && (
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={remove}>삭제</button>
          )}
        </div>
      </div>

      {!openaiConfigured && (
        <p className="mt-2 text-sm text-warning">
          OpenAI API 키가 등록되지 않았습니다. <Link href="/settings#openai" className="underline">설정에서 등록</Link>하면 평가할 수 있습니다.
        </p>
      )}
      {openaiConfigured && !canEvaluate && blockedReason && <p className="mt-2 text-sm text-muted">{blockedReason}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!evaluation && canEvaluate && openaiConfigured && !error && (
        <p className="mt-2 text-sm text-muted">
          평가 기준을 고르고 실행하면 질문별 항목 점수(1~5)·코멘트·강점·개선점과 면접 전체 총평이 나옵니다. 대화 기록(전사)만 보므로 발음·속도는 평가하지 않습니다.
        </p>
      )}

      {evaluation && <EvaluationBody evaluation={evaluation} />}
    </section>
  );
}

function EvaluationBody({ evaluation }: { evaluation: EvaluationView }) {
  const { criteria, result } = evaluation;
  const nameById = new Map(criteria.map((c) => [c.id, c.name]));
  const averages = new Map(criterionAverages(result, criteria).map((a) => [a.criterionId, a.average]));
  const overallAvg = result.overall.scores.length
    ? (result.overall.scores.reduce((sum, s) => sum + s.score, 0) / result.overall.scores.length).toFixed(1)
    : null;

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-border bg-surface-2/40 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">종합</h3>
          {overallAvg && <p className="text-sm text-muted">평균 <b className="text-text tabular-nums">{overallAvg}</b> / 5</p>}
        </div>
        <ul className="mt-3 space-y-2">
          {result.overall.scores.map((s) => (
            <li key={s.criterionId} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate font-medium">{nameById.get(s.criterionId) ?? s.criterionId}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-border">
                  <span className={`block h-full ${SCORE_TONE(s.score)}`} style={{ width: `${s.score * 20}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums">{s.score}/5</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                  답변 평균 {averages.get(s.criterionId) ?? "-"}
                </span>
              </div>
              {s.comment && <p className="mt-0.5 pl-34 text-xs text-muted">{s.comment}</p>}
            </li>
          ))}
        </ul>
        {result.overall.summary && <p className="mt-3 whitespace-pre-wrap text-sm">{result.overall.summary}</p>}
        <Lists strengths={result.overall.strengths} improvements={result.overall.improvements} />
      </div>

      <ol className="space-y-3">
        {result.answers.map((a, i) => (
          <li key={a.key} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {i + 1}. {a.questionText}
              </h3>
              {a.turnIds[0] && (
                <a href={`#turn-${a.turnIds[0]}`} className="text-xs text-primary hover:underline">대화로 이동</a>
              )}
            </div>
            {a.answerText && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">내 답변 보기</summary>
                <p className="mt-1 whitespace-pre-wrap">{a.answerText}</p>
              </details>
            )}
            <ul className="mt-3 space-y-1.5">
              {a.scores.map((s) => (
                <li key={s.criterionId} className="flex gap-2 text-sm">
                  <span className="w-32 shrink-0 truncate font-medium">{nameById.get(s.criterionId) ?? s.criterionId}</span>
                  <span className="w-8 shrink-0 tabular-nums">{s.score}/5</span>
                  <span className="min-w-0 flex-1 text-xs text-muted">{s.comment}</span>
                </li>
              ))}
            </ul>
            <Lists strengths={a.strengths} improvements={a.improvements} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Lists({ strengths, improvements }: { strengths: string[]; improvements: string[] }) {
  if (!strengths.length && !improvements.length) return null;
  return (
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {strengths.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-success">강점</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {improvements.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warning">개선점</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {improvements.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
