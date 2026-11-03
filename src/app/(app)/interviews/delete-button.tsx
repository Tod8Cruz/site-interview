"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteInterviewRecordings } from "@/lib/recorder/chunk-store";

export function DeleteInterviewButton({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 면접 기록과 녹음을 삭제할까요?")) return;
        startTransition(async () => {
          const response = await fetch(`/api/interviews/${id}`, { method: "DELETE" });
          if (!response.ok) {
            alert("삭제하지 못했습니다.");
            return;
          }
          await deleteInterviewRecordings(id).catch(() => {});
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      삭제
    </button>
  );
}
