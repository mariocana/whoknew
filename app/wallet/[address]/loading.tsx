export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="loading">
      <div className="h-3 w-20 rounded bg-panel" />
      <div className="h-8 w-3/4 rounded bg-panel" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-panel" />)}
      </div>
      <div className="h-72 rounded-lg bg-panel" />
    </div>
  );
}
