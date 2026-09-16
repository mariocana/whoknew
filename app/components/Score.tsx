import type { Flag } from "@/lib/screen/score";

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-3xl w-16 h-16" : "text-base w-10 h-10";
  return (
    <span
      className={`num inline-flex items-center justify-center rounded-md border border-line bg-panel font-semibold ${cls}`}
      title="0–100: how much this position looks like someone who knew"
    >
      {score}
    </span>
  );
}

/** The four factors behind a score, as short bars — the number is never shown alone. */
export function Factors({ flag, compact = false }: { flag: Flag; compact?: boolean }) {
  return (
    <ul className={`grid gap-x-6 gap-y-1 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"}`}>
      {flag.factors.map((f) => (
        <li key={f.name} className="text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="uppercase tracking-wider text-muted">{f.name}</span>
            <span className="num text-ink-2">{Math.round(f.value * 100)}</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, f.value * 100)}%`, background: "var(--seq-500)" }} />
          </div>
          {!compact && <p className="mt-1 text-ink-2 leading-snug">{f.detail}</p>}
        </li>
      ))}
    </ul>
  );
}
