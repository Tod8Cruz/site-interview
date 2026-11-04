"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { QuestionGroup } from "@/db/schema";
import { makeDefaultGroup, removeGroup, saveGroup, type GroupFormState } from "./actions";

type Group = QuestionGroup & { questionCount: number };

/** 그룹 하나: 이름 고치기, 기본값으로, 삭제(질문은 기본 그룹으로 옮겨진다). */
export function GroupRow({ group, defaultName }: { group: Group; defaultName: string }) {
  const [state, action, pending] = useActionState<GroupFormState, FormData>(saveGroup.bind(null, group.id), {});
  const [removeError, setRemoveError] = useState<string>();

  return (
    <li className="card p-4">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input name="name" required maxLength={100} defaultValue={group.name} aria-label="그룹 이름"
          className="input min-w-0 flex-1 basis-48" />
        <button type="submit" disabled={pending} className="btn btn-sm">{pending ? "저장 중…" : "이름 저장"}</button>
        <Link href={`/questions?group=${group.id}`} className="btn btn-sm">질문 {group.questionCount}개</Link>
        {group.isDefault ? (
          <span className="chip bg-primary/15 text-primary">기본값</span>
        ) : (
          <>
            <button type="button" className="btn btn-sm" onClick={() => makeDefaultGroup(group.id)}>기본값으로</button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={async () => {
                const moved = group.questionCount
                  ? ` 질문 ${group.questionCount}개는 "${defaultName}" 그룹으로 옮겨집니다.`
                  : "";
                if (confirm(`"${group.name}" 그룹을 삭제할까요?${moved}`)) setRemoveError((await removeGroup(group.id)).error);
              }}
            >
              삭제
            </button>
          </>
        )}
      </form>
      {(state.error || removeError) && <p className="mt-2 text-sm text-danger">{state.error ?? removeError}</p>}
    </li>
  );
}

/** 새 그룹 추가. 저장에 성공하면 입력칸을 비운다(key로 다시 그린다). */
export function NewGroupForm() {
  const [state, action, pending] = useActionState<GroupFormState, FormData>(saveGroup.bind(null, null), {});
  return (
    <form key={state.savedAt} action={action} className="card flex flex-wrap items-center gap-2 p-4">
      <input name="name" required maxLength={100} placeholder="새 그룹 이름 (예: ○○전자 공채, 교대 면접)"
        aria-label="새 그룹 이름" className="input min-w-0 flex-1 basis-48" />
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">{pending ? "추가 중…" : "그룹 추가"}</button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
