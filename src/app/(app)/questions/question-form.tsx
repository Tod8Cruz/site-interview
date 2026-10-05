"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Question } from "@/db/schema";
import { removeQuestion, saveQuestion, type QuestionFormState } from "./actions";

export function QuestionForm({ question, categories }: { question?: Question; categories: string[] }) {
  const save = saveQuestion.bind(null, question?.id ?? null);
  const [state, action, pending] = useActionState<QuestionFormState, FormData>(save, {});

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="question">질문</label>
        <textarea id="question" name="question" required rows={2} maxLength={1000}
          defaultValue={question?.question} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="modelAnswer">모범답안 <span className="font-normal text-muted">(마크다운)</span></label>
        <textarea id="modelAnswer" name="modelAnswer" rows={12} maxLength={20000}
          defaultValue={question?.modelAnswer} className="input font-mono" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">카테고리</label>
          <input id="category" name="category" list="category-options" maxLength={100}
            defaultValue={question?.category ?? ""} className="input" placeholder="예: 인성, 지원동기, 기술" />
          <datalist id="category-options">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="tags">태그 <span className="font-normal text-muted">(쉼표로 구분)</span></label>
          <input id="tags" name="tags" defaultValue={question?.tags.join(", ")} className="input"
            placeholder="예: 협업, 경험" />
        </div>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "저장 중…" : "저장"}</button>
        <Link href="/questions" className="btn">취소</Link>
        {question && (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            onClick={async () => {
              if (confirm("이 질문을 삭제할까요?")) await removeQuestion(question.id);
            }}
          >
            삭제
          </button>
        )}
      </div>
    </form>
  );
}
