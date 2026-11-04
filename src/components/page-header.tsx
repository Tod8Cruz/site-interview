export function PageHeader({
  title,
  description,
  actions,
}: {
  /** 문자열이면 h1로 감싼다. 직접 제목 요소를 그려야 할 때만 노드를 넘긴다. */
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? <h1 className="text-xl font-semibold">{title}</h1> : title}
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
