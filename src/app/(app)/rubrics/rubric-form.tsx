"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EvaluationRubric } from "@/db/schema";
import type { RubricCriterion } from "@/lib/evaluation";
import { removeRubric, saveRubric, type RubricFormState } from "./actions";

const MAX_CRITERIA = 20;
const blank = (): RubricCriterion => ({ id: crypto.randomUUID(), name: "", description: "" });

export function RubricForm({ rubric }: { rubric?: EvaluationRubric }) {
  const save = saveRubric.bind(null, rubric?.id ?? null);
  const [state, action, pending] = useActionState<RubricFormState, FormData>(save, {});
  const [criteria, setCriteria] = useState<RubricCriterion[]>(rubric?.criteria.length ? rubric.criteria : [blank()]);

  const update = (index: number, patch: Partial<RubricCriterion>) =>
    setCriteria((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const move = (index: number, delta: number) =>
    setCriteria((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const remove = (index: number) => setCriteria((list) => (list.length > 1 ? list.filter((_, i) => i !== index) : list));

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="name">이름</label>
          <input id="name" name="name" required maxLength={100} defaultValue={rubric?.name} className="input"
            placeholder="예: 인성 면접 기준" />
        </div>

        <div className="space-y-3">
          <p className="label">평가 항목 ({criteria.length}/{MAX_CRITERIA})</p>
          <ol className="space-y-3">
            {criteria.map((c, i) => (
              <li key={c.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted">{i + 1}.</span>
                  <input
                    value={c.name}
                    maxLength={100}
                    required
                    placeholder="항목 이름 (예: 구조와 논리)"
                    aria-label={`항목 ${i + 1} 이름`}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="input flex-1"
                  />
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button>
                    <button type="button" className="btn btn-sm" disabled={i === criteria.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button>
                    <button type="button" className="btn btn-sm btn-danger" disabled={criteria.length === 1} onClick={() => remove(i)}>삭제</button>
                  </div>
                </div>
                <textarea
                  value={c.description}
                  rows={2}
                  maxLength={1000}
                  placeholder="무엇을 볼지 (예: 결론을 먼저 말하고 근거가 이어지는가. 경험 답변은 상황·행동·결과가 드러나는가)"
                  aria-label={`항목 ${i + 1} 설명`}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="input mt-2 text-sm"
                />
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn btn-sm"
            disabled={criteria.length >= MAX_CRITERIA}
            onClick={() => setCriteria((list) => [...list, blank()])}
          >
            항목 추가
          </button>
          {/* 행 입력은 상태만 바꾸고, 저장은 이 JSON 하나로 보낸다. */}
          <input type="hidden" name="criteria" value={JSON.stringify(criteria)} />
        </div>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "저장 중…" : "저장"}</button>
          <Link href="/rubrics" className="btn">취소</Link>
          {rubric && (
            <button type="button" className="btn btn-danger ml-auto"
              onClick={async () => {
                if (confirm("이 평가 기준을 삭제할까요? 저장된 평가 결과에는 영향이 없습니다.")) await removeRubric(rubric.id);
              }}>
              삭제
            </button>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 p-4 text-xs text-muted">
          <h2 className="text-sm font-semibold text-text">어떻게 쓰이나요</h2>
          <p>AI가 답변 묶음(질문별)마다 각 항목을 1~5점으로 채점하고 코멘트를 씁니다. 면접 전체에 대한 항목별 종합 점수와 총평도 함께 나옵니다.</p>
          <p>항목 설명은 그대로 AI에게 전달됩니다. “무엇을 보면 높은 점수인지”를 한두 문장으로 적으면 채점이 일관됩니다.</p>
          <p>모범답변과 비슷한지는 평가하지 않도록 지시되어 있습니다. 암기한 답을 보상하지 않기 위해서입니다.</p>
        </div>
      </aside>
    </form>
  );
}
