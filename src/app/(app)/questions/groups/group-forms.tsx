"use client";

import { useActionState, useRef, useState } from "react";
import type { QuestionGroup } from "@/db/schema";
import { removeGroup, saveGroup, type GroupFormState } from "./actions";

/** 그룹 화면 제목: 이름 옆 연필을 누르면 그 자리에서 이름을 고치거나 그룹을 지운다(질문은 기본 그룹으로 옮겨진다). */
export function GroupTitle({ group }: { group: QuestionGroup }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<GroupFormState, FormData>(async (prev, formData) => {
    const result = await saveGroup(group.id, prev, formData);
    if (!result.error) setEditing(false);
    return result;
  }, {});
  const [removeError, setRemoveError] = useState<string>();

  if (!editing) {
    return (
      <h1 className="flex items-center gap-1.5 text-xl font-semibold">
        {group.name}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="그룹 이름 수정"
          title="그룹 이름 수정"
          className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11.5 2.5l2 2L5 13H3v-2z" />
            <path d="M9.5 4.5l2 2" />
          </svg>
        </button>
      </h1>
    );
  }

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input name="name" required maxLength={100} defaultValue={group.name} aria-label="그룹 이름" autoFocus
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="input min-w-0 flex-1 basis-48 text-lg font-semibold" />
        <button type="submit" disabled={pending} className="btn btn-sm btn-primary">{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
        {!group.isDefault && (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={async () => {
              if (confirm(`"${group.name}" 그룹을 삭제할까요? 이 그룹의 질문은 기본 그룹으로 옮겨집니다.`)) {
                setRemoveError((await removeGroup(group.id))?.error);
              }
            }}
          >
            그룹 삭제
          </button>
        )}
      </form>
      {(state.error || removeError) && <p className="mt-2 text-sm text-danger">{state.error ?? removeError}</p>}
    </div>
  );
}

/** 그룹 추가 버튼 + 이름을 받는 모달. 만들면 그 그룹 화면으로 간다. */
export function NewGroupButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<GroupFormState, FormData>(saveGroup.bind(null, null), {});
  // 열 때마다 입력칸을 새로 그리고, 오류는 이번에 열고 나서 제출한 것만 보인다.
  const [openCount, setOpenCount] = useState(0);
  const [submittedAt, setSubmittedAt] = useState(-1);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setOpenCount((n) => n + 1);
          dialogRef.current?.showModal();
        }}
      >
        +예상 질문 그룹
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="new-group-title"
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40"
      >
        <form key={openCount} action={action} onSubmit={() => setSubmittedAt(openCount)} className="space-y-4 p-5">
          <h2 id="new-group-title" className="text-lg font-semibold">그룹 추가</h2>
          <div>
            <label className="label" htmlFor="new-group-name">그룹 이름</label>
            <input id="new-group-name" name="name" required maxLength={100} autoFocus
              placeholder="예: ○○전자 공채, 교대 면접" className="input" />
          </div>
          {submittedAt === openCount && state.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>취소</button>
            <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "만드는 중…" : "만들기"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
