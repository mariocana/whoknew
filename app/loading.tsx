export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="loading">
      <div className="h-7 w-2/3 rounded bg-panel" />
      <div className="h-4 w-full rounded bg-panel" />
      <div className="h-4 w-5/6 rounded bg-panel" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr] gap-4">
            <div className="h-10 w-10 rounded-md bg-panel" />
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-panel" />
              <div className="h-3 w-1/2 rounded bg-panel" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
