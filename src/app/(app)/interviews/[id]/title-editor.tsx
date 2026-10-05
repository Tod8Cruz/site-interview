"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** I-5: 면접 제목 수정 */
export function TitleEditor({ interviewId, title }: { interviewId: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = value.trim();
    if (!next || next === title) {
      setValue(title);
      setEditing(false);
      return;
    }
    setSaving(true);
    const response = await fetch(`/api/interviews/${interviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    setSaving(false);
    if (!response.ok) {
      alert("제목을 저장하지 못했습니다.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <span className="truncate">{title}</span>
        <button className="btn btn-sm shrink-0 font-normal" onClick={() => setEditing(true)}>이름 바꾸기</button>
      </h1>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input autoFocus value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} className="input text-base" aria-label="면접 제목" />
      <button className="btn btn-primary" disabled={saving}>저장</button>
      <button type="button" className="btn" onClick={() => { setValue(title); setEditing(false); }}>취소</button>
    </form>
  );
}
