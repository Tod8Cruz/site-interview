"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteRecording, listStoredRecordings } from "@/lib/recorder/chunk-store";
import { uploadRecording } from "@/lib/recorder/upload";

type Outcome = { uploaded: string[]; failed: string[] };

const TRIED_KEY = (id: string) => `recording-recovery:${id}`;

function alreadyTried(id: string) {
  try {
    return sessionStorage.getItem(TRIED_KEY(id)) === "1";
  } catch {
    return false;
  }
}

function markTried(id: string) {
  try {
    sessionStorage.setItem(TRIED_KEY(id), "1");
  } catch {
    // 저장소를 못 쓰면 매번 시도한다.
  }
}

/**
 * L-10: 앱에 접속하면 이 브라우저(IndexedDB)에 남아 있는 미업로드 녹음을 찾아 업로드한다.
 * 진행 중인 면접과 이미 업로드된 면접은 건드리지 않는다. 탭 세션당 면접별로 한 번만 시도한다.
 */
export function RecordingRecovery() {
  const pathname = usePathname();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await listStoredRecordings().catch(() => []);
      const result: Outcome = { uploaded: [], failed: [] };
      for (const meta of stored) {
        const id = meta.interviewId;
        if (cancelled || pathname === `/interviews/${id}/live` || alreadyTried(id)) continue;
        const response = await fetch(`/api/interviews/${id}`).catch(() => null);
        if (!response) continue;
        if (response.status === 404) {
          await deleteRecording(id);
          continue;
        }
        if (!response.ok) continue;
        const { status, audioStatus } = (await response.json()) as { status: string; audioStatus: string };
        if (audioStatus === "uploaded") {
          await deleteRecording(id);
          continue;
        }
        if (status === "in_progress") continue; // 아직 진행 중이거나 정리 전
        markTried(id);
        const upload = await uploadRecording(id);
        (upload.ok ? result.uploaded : result.failed).push(id);
      }
      if (!cancelled && (result.uploaded.length || result.failed.length)) setOutcome(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!outcome) return null;
  const failedId = outcome.failed[0];
  return (
    <div role="status" className="card fixed right-4 bottom-4 z-20 max-w-sm p-4 text-sm shadow-lg">
      {outcome.uploaded.length > 0 && <p>이전에 올리지 못한 녹음 {outcome.uploaded.length}개를 업로드했습니다.</p>}
      {failedId && (
        <p className="text-warning">
          녹음 {outcome.failed.length}개를 아직 업로드하지 못했습니다. 이 브라우저에 보관되어 있습니다.{" "}
          <Link href={`/interviews/${failedId}`} className="underline">다시 보기에서 재시도</Link>
        </p>
      )}
      <button className="btn btn-sm mt-2" onClick={() => setOutcome(null)}>닫기</button>
    </div>
  );
}
