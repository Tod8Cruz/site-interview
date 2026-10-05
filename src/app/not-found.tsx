import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center text-sm">
        <h1 className="mb-2 text-lg font-semibold">페이지를 찾을 수 없습니다</h1>
        <Link href="/interviews" className="btn btn-primary mt-2">처음으로</Link>
      </div>
    </main>
  );
}
