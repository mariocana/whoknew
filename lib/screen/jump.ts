import type { Candle } from "../nansen/pm.ts";

export interface Jump {
  /** Hour in which the news landed (period_start of the candle). */
  at: string;
  /** Winning side's price before that hour — what the market believed. */
  priceBefore: number;
  priceAfter: number;
  volumeUsd: number;
  traders: number;
}

export interface MarketShape {
  winner: string;
  loser: string;
  finalPrice: number;
  jumps: Jump[];
}

const MIN_MOVE = 0.25;
const MIN_TRADES = 5;   // a one-trade candle in a thin book is not news
const STICK = 0.15;     // the re-pricing has to hold over the following candles

/**
 * Reads a resolved binary market's hourly candles and finds the hours in
 * which the winning side re-priced sharply upward. Returns null when the
 * market did not resolve cleanly (no side closed ≥ 0.95).
 */
export function findJumps(candles: Candle[]): MarketShape | null {
  const sides = [...new Set(candles.map((c) => c.side))];
  if (sides.length !== 2) return null;

  const bySide = (s: string) =>
    candles.filter((c) => c.side === s).sort((a, b) => a.period_start.localeCompare(b.period_start));

  const winner = sides.find((s) => (bySide(s).at(-1)?.close ?? 0) >= 0.95);
  if (!winner) return null;
  const loser = sides.find((s) => s !== winner)!;

  const series = bySide(winner);
  const jumps: Jump[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].close;
    const cur = series[i].close;
    if (cur - prev < MIN_MOVE || series[i].trade_count < MIN_TRADES) continue;
    const after = series.slice(i + 1, i + 4);
    const held = after.length === 0 || after.reduce((s, c) => s + c.close, 0) / after.length - prev >= STICK;
    if (held) {
      jumps.push({
        at: series[i].period_start,
        priceBefore: prev,
        priceAfter: cur,
        volumeUsd: series[i].volume_usd,
        traders: series[i].unique_traders,
      });
    }
  }

  return { winner, loser, finalPrice: series.at(-1)!.close, jumps };
}
