import type { Position } from "./positions.ts";
import type { Jump } from "./jump.ts";

export interface Factor {
  name: "size" | "odds" | "timing" | "share";
  value: number;   // 0..1
  detail: string;
}

export interface Flag {
  wallet: string;
  score: number;   // 0..100
  factors: Factor[];
  position: Position;
  jump: Jump;
}

const HOUR = 3_600_000;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const hoursBetween = (a: string, b: string) => (new Date(b + "Z").getTime() - new Date(a + "Z").getTime()) / HOUR;

/**
 * How much a pre-jump position looks like someone who knew. Every factor is
 * exposed so the number is never the whole story.
 *
 *   size    how much money — $100 is noise, $10k is a statement
 *   odds    how unlikely the market thought it was when they bought
 *   timing  how close to the news the last buy landed
 *   share   how much of everyone's pre-jump conviction was theirs
 */
export function scorePosition(p: Position, jump: Jump, totalPreJumpUsd: number): Flag {
  const size = clamp((Math.log10(Math.max(p.costUsd, 1)) - 2) / 2);       // $100 → 0, $1k → 0.5, $10k → 1
  const odds = clamp((0.5 - p.avgPrice) / 0.45);                           // ≤0.05 → 1, ≥0.5 → 0
  const hrs = hoursBetween(p.lastBuyAt, jump.newsAt ?? jump.at);
  const timing = clamp(1 - Math.log10(Math.max(hrs, 1)) / 3);             // 1h → 1, 1000h → 0
  const share = totalPreJumpUsd > 0 ? clamp(p.costUsd / totalPreJumpUsd) : 0;

  const factors: Factor[] = [
    { name: "size", value: size, detail: `$${Math.round(p.costUsd).toLocaleString("en-US")} at risk` },
    { name: "odds", value: odds, detail: `bought at ${p.avgPrice.toFixed(2)}, market was at ${jump.priceBefore.toFixed(2)} before the news` },
    { name: "timing", value: timing, detail: `last buy ${hrs < 48 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(0)}d`} before the news` },
    { name: "share", value: share, detail: `${(share * 100).toFixed(0)}% of all pre-news money on the winner` },
  ];

  // Size is the gate: a tiny bet cannot be a strong signal whatever its timing.
  const score = 100 * size * (0.4 * odds + 0.35 * timing + 0.25 * share);
  return { wallet: p.wallet, score: Math.round(clamp(score / 100) * 100), factors, position: p, jump };
}
