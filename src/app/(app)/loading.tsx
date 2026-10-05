export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="불러오는 중">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}
