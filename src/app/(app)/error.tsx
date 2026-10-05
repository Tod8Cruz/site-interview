"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto max-w-lg p-6 text-sm">
      <h1 className="mb-2 text-lg font-semibold">문제가 생겼습니다</h1>
      <p className="text-muted">
        페이지를 불러오는 중 오류가 났습니다. 데이터베이스 연결이나 환경변수 설정을 확인해 주세요.
        {error.digest && <span className="mt-1 block text-xs">오류 코드: {error.digest}</span>}
      </p>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" onClick={() => retry()}>다시 시도</button>
        <Link href="/interviews" className="btn">모의 면접 목록</Link>
      </div>
    </div>
  );
}
