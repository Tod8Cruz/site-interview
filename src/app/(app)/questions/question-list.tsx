"use client";

import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import type { Question } from "@/db/schema";

export function QuestionList({ questions }: { questions: Question[] }) {
  const [hideAnswers, setHideAnswers] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (!questions.length) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        질문이 없습니다. <Link href="/questions/new" className="text-primary underline">첫 질문을 추가</Link>하거나
        질문 API로 등록하세요.
      </div>
    );
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={hideAnswers} onChange={(e) => setHideAnswers(e.target.checked)} />
        답변 가리기 <span className="text-muted">(스스로 답해 본 뒤 펼쳐 보세요)</span>
      </label>
      <ul className="space-y-2">
        {questions.map((q) => {
          const expanded = open.has(q.id);
          return (
            <li key={q.id} className="card">
              <div className="flex items-start gap-3 p-4">
                <button onClick={() => toggle(q.id)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
                  <p className="font-medium">{q.question}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {q.category && <span className="chip">{q.category}</span>}
                    {q.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
                  </div>
                </button>
                <Link href={`/questions/${q.id}`} className="btn btn-sm shrink-0">수정</Link>
              </div>
              {expanded && (
                <div className="border-t border-border px-4 py-3">
                  {hideAnswers && !revealed.has(q.id) ? (
                    <button
                      className="text-sm text-primary underline"
                      onClick={() => setRevealed((prev) => new Set(prev).add(q.id))}
                    >
                      답변 보기
                    </button>
                  ) : q.modelAnswer ? (
                    <Markdown>{q.modelAnswer}</Markdown>
                  ) : (
                    <p className="text-sm text-muted">모범답변이 없습니다.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
