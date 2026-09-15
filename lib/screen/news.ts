import type { Trade } from "../nansen/pm.ts";
import type { Jump } from "./jump.ts";

const QUIET = 0.08;

/**
 * Hourly candles say which hour the market re-priced; the trades say the
 * minute. Walking back from the jump hour, the news moment is the first trade
 * of the final run-up — after it the winner never trades near its old price
 * again. Positions taken before that instant are "before the news";
 * anything later is a reaction, however fast.
 */
export function newsMoment(trades: Trade[], winner: string, jump: Jump): string {
  const before = trades
    .filter((t) => t.timestamp < jump.at)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let lastQuiet = -1;
  for (let i = 0; i < before.length; i++) {
    const t = before[i];
    const price = t.side === winner ? t.price : 1 - t.price;
    if (price <= jump.priceBefore + QUIET) lastQuiet = i;
  }

  const first = before[lastQuiet + 1];
  return first && first.timestamp < jump.at ? first.timestamp : jump.at;
}
