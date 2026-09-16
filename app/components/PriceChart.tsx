"use client";

import { useEffect, useMemo, useState } from "react";

export interface ChartCandle { t: string; close: number; volume: number }
export interface ChartBuy { t: string; price: number; usd: number }

interface Props {
  candles: ChartCandle[];
  buys: ChartBuy[];
  newsAt: string;
  from: string;
  to: string;
  walletLabel: string;
  winner: string;
}

const ms = (iso: string) => new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
const fmt = (iso: string) => iso.slice(5, 16).replace("T", " ");

/**
 * The winning side's hourly price, with the flagged wallet's buys overlaid at the
 * minute they happened and the news moment marked. One series, so no legend; the
 * orange dots are named in the caption.
 */
export function PriceChart({ candles, buys, newsAt, from, to, walletLabel, winner }: Props) {
  // On a phone the SVG is scaled to ~40% of its desktop width, which would shrink 11px labels to
  // 4px. A narrower viewBox keeps text and dots legible at the cost of fewer ticks.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const W = narrow ? 420 : 880, H = narrow ? 240 : 260, L = narrow ? 34 : 44, R = narrow ? 10 : 16, T = 16, B = 28;
  const [hover, setHover] = useState<number | null>(null);

  const { x, y, path, pts, dots, newsX, ticks } = useMemo(() => {
    const t0 = ms(from), t1 = ms(to);
    const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
    const y = (p: number) => T + (1 - p) * (H - T - B);
    const pts = candles.map((c) => ({ ...c, X: x(ms(c.t)), Y: y(c.close) }));
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(" ");
    const maxUsd = Math.max(1, ...buys.map((b) => b.usd));
    const dots = buys.map((b) => ({ ...b, X: x(ms(b.t)), Y: y(b.price), r: (narrow ? 2 : 2.5) + (narrow ? 6 : 9) * Math.sqrt(b.usd / maxUsd) }));
    const ticks: { X: number; label: string }[] = [];
    const span = t1 - t0;
    let step = span > 6 * 86_400_000 ? 2 * 86_400_000 : span > 2 * 86_400_000 ? 86_400_000 : 6 * 3_600_000;
    if (narrow) step *= 2;
    for (let t = Math.ceil(t0 / step) * step; t < t1; t += step) ticks.push({ X: x(t), label: new Date(t).toISOString().slice(5, step >= 86_400_000 ? 10 : 16).replace("T", " ") });
    return { x, y, path, pts, dots, newsX: x(ms(newsAt)), ticks };
  }, [candles, buys, newsAt, from, to, narrow, W, H, L, R]);

  const hovered = hover !== null ? pts[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, d = Infinity;
    pts.forEach((p, i) => { const dd = Math.abs(p.X - px); if (dd < d) { d = dd; best = i; } });
    setHover(pts.length ? best : null);
  }

  return (
    <figure className="rounded-lg border border-line bg-panel p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${winner} price with ${walletLabel}'s buys`}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={y(p) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="num">{Math.round(p * 100)}¢</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t.X} x={t.X} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)" className="num">{t.label}</text>
        ))}

        <line x1={newsX} x2={newsX} y1={T} y2={H - B} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={newsX > W * 0.75 ? newsX - 5 : newsX + 5} y={T + 10} fontSize={11} fill="var(--ink-2)" textAnchor={newsX > W * 0.75 ? "end" : "start"}>the market learns</text>

        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

        {dots.map((d, i) => (
          <circle key={i} cx={d.X} cy={d.Y} r={d.r} fill="var(--series-2)" fillOpacity={0.85} stroke="var(--panel)" strokeWidth={2} />
        ))}

        {hovered && (
          <g>
            <line x1={hovered.X} x2={hovered.X} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={hovered.X} cy={hovered.Y} r={5} fill="var(--series-1)" stroke="var(--panel)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-muted">
        <span>
          <span className="inline-block w-3 h-0.5 align-middle mr-1.5" style={{ background: "var(--series-1)" }} />
          {winner} · hourly close
          <span className="inline-block w-2.5 h-2.5 rounded-full align-middle ml-4 mr-1.5" style={{ background: "var(--series-2)" }} />
          {walletLabel}&rsquo;s buys, sized by dollars, placed at the minute and price paid
        </span>
        <span className="num text-ink-2 min-h-4">
          {hovered ? `${fmt(hovered.t)} UTC — ${Math.round(hovered.close * 100)}¢, $${Math.round(hovered.volume).toLocaleString("en-US")} traded in the hour` : ""}
        </span>
      </figcaption>
    </figure>
  );
}
