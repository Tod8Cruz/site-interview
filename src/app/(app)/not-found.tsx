import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-6 text-sm">
      <h1 className="mb-2 text-lg font-semibold">찾을 수 없습니다</h1>
      <p className="text-muted">삭제되었거나 주소가 잘못된 항목입니다.</p>
      <div className="mt-4 flex gap-2">
        <Link href="/interviews" className="btn btn-primary">모의 면접 목록</Link>
        <Link href="/questions" className="btn">예상 질문</Link>
      </div>
    </div>
  );
}
