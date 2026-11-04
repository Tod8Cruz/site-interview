"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Question, QuestionGroup } from "@/db/schema";
import { removeQuestion, saveQuestion, type QuestionFormState } from "./actions";

type Props = {
  question?: Question;
  groups: QuestionGroup[];
  /** 새 질문의 그룹. 질문 목록에서 보던 그룹이 넘어온다. */
  initialGroupId?: string;
};

export function QuestionForm({ question, groups, initialGroupId }: Props) {
  const save = saveQuestion.bind(null, question?.id ?? null);
  const [state, action, pending] = useActionState<QuestionFormState, FormData>(save, {});
  const backGroupId = question?.groupId ?? initialGroupId;

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="groupId">그룹</label>
        <select id="groupId" name="groupId" className="input"
          defaultValue={question?.groupId ?? initialGroupId ?? groups.find((g) => g.isDefault)?.id}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.isDefault ? " (기본)" : ""}</option>
          ))}
        </select>
      </div>
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
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "저장 중…" : "저장"}</button>
        <Link href={backGroupId ? `/questions/groups/${backGroupId}` : "/questions"} className="btn">취소</Link>
        {question && (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            onClick={async () => {
              if (confirm("이 질문을 삭제할까요?")) await removeQuestion(question.id, question.groupId);
            }}
          >
            삭제
          </button>
        )}
      </div>
    </form>
  );
}
