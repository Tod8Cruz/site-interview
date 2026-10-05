"use client";

import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import type { Question } from "@/db/schema";

/** 이 길이를 넘는 모범답안은 접어 두고 "더 보기"로 펼친다. */
const COLLAPSE_CHARS = 400;

export function QuestionList({ questions }: { questions: Question[] }) {
  const [hideAnswers, setHideAnswers] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (!questions.length) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        질문이 없습니다. <Link href="/questions/new" className="text-primary underline">첫 질문을 추가</Link>하거나
        질문 API로 등록하세요.
      </div>
    );
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hideAnswers}
          onChange={(e) => {
            setHideAnswers(e.target.checked);
            setRevealed(new Set());
          }}
        />
        답변 가리기 <span className="text-muted">(스스로 답해 본 뒤 펼쳐 보세요)</span>
      </label>
      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-4 border-b border-border bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid">
          <div>질문</div>
          <div>모범답안</div>
          <div className="w-12" />
        </div>
        <ul className="divide-y divide-border">
          {questions.map((q) => {
            const hidden = hideAnswers && !revealed.has(q.id);
            const isLong = q.modelAnswer.length > COLLAPSE_CHARS;
            const isExpanded = expanded.has(q.id);
            return (
              <li key={q.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] md:gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{q.question}</p>
                  {(q.category || q.tags.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {q.category && <span className="chip">{q.category}</span>}
                      {q.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-muted md:hidden">모범답안</p>
                  {hidden ? (
                    <button
                      className="text-sm text-primary underline"
                      onClick={() => setRevealed((prev) => new Set(prev).add(q.id))}
                    >
                      답변 보기
                    </button>
                  ) : q.modelAnswer ? (
                    <>
                      <div className={isLong && !isExpanded ? "relative max-h-40 overflow-hidden" : undefined}>
                        <Markdown>{q.modelAnswer}</Markdown>
                        {isLong && !isExpanded && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
                        )}
                      </div>
                      {isLong && (
                        <button
                          className="mt-1 text-xs text-primary underline"
                          onClick={() => toggleExpanded(q.id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "접기" : "더 보기"}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">모범답안이 없습니다.</p>
                  )}
                </div>
                <div className="md:w-12 md:text-right">
                  <Link href={`/questions/${q.id}`} className="btn btn-sm">수정</Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
