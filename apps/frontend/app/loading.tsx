export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="loading">
      <div className="h-32 animate-pulse rounded-2xl border bg-muted/40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}
