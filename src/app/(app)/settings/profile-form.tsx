"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CandidateProfile } from "@/db/schema";
import { removeProfile, saveProfile, type ProfileFormState } from "./actions";

export function ProfileForm({ profile }: { profile?: CandidateProfile }) {
  const save = saveProfile.bind(null, profile?.id ?? null);
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(save, {});

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="name">이름</label>
        <input id="name" name="name" required maxLength={100} defaultValue={profile?.name} className="input"
          placeholder="예: ○○전자 영업관리 신입 / ○○교대 수시" />
      </div>
      <div>
        <label className="label" htmlFor="content">
          지원자 정보 <span className="font-normal text-muted">(프롬프트의 {"{{context}}"} 자리에 들어갑니다)</span>
        </label>
        <textarea id="content" name="content" required rows={12} maxLength={10000} defaultValue={profile?.content}
          className="input leading-relaxed"
          placeholder={"예) ○○전자 영업관리 신입 지원. 경영학 전공, 화장품 회사 영업지원 인턴 6개월, 마케팅 학회 활동.\n\n예) ○○교대 초등교육과 학생부종합전형. 생활기록부: 교육봉사 동아리 부장, 멘토링 120시간, 수학 세특에서 또래 튜터링."} />
        <p className="mt-1 text-xs text-muted">지원 회사·직무·경력, 또는 지원 대학·학과·전형과 생활기록부 요약을 적으세요. 면접관이 이 내용으로 질문합니다.</p>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "저장 중…" : "저장"}</button>
        <Link href="/settings" className="btn">취소</Link>
        {profile && (
          <button type="button" className="btn btn-danger ml-auto"
            onClick={async () => {
              if (confirm("이 지원자 정보를 삭제할까요? 지난 면접 기록에는 영향이 없습니다.")) await removeProfile(profile.id);
            }}>
            삭제
          </button>
        )}
      </div>
    </form>
  );
}
