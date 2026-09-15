import type { Trade } from "../nansen/pm.ts";

export interface Position {
  wallet: string;
  /** Net shares of the winning side held going into the jump. */
  shares: number;
  /** USDC paid for those shares, net of any sold. */
  costUsd: number;
  avgPrice: number;
  trades: number;
  firstBuyAt: string;
  lastBuyAt: string;
}

/**
 * Net long exposure to `winner` per wallet, from trades strictly before `until`.
 * Buying the winner and selling the loser are the same bet; both roles count.
 * Mints and merges do not appear in the trade feed, so this is a floor.
 */
export function positionsBefore(trades: Trade[], winner: string, until: string): Position[] {
  const book = new Map<string, Position>();

  for (const t of trades) {
    if (t.timestamp >= until) continue;
    const onWinner = t.side === winner;
    const priceOfWinner = onWinner ? t.price : 1 - t.price;
    const long = onWinner ? t.buyer : t.seller;
    const short = onWinner ? t.seller : t.buyer;

    for (const [wallet, sign] of [[long, 1], [short, -1]] as const) {
      const p = book.get(wallet) ?? {
        wallet, shares: 0, costUsd: 0, avgPrice: 0, trades: 0, firstBuyAt: t.timestamp, lastBuyAt: t.timestamp,
      };
      p.shares += sign * t.size;
      p.costUsd += sign * t.size * priceOfWinner;
      p.trades += 1;
      if (sign > 0) p.lastBuyAt = t.timestamp;
      book.set(wallet, p);
    }
  }

  return [...book.values()]
    .filter((p) => p.shares > 1 && p.costUsd > 0)
    .map((p) => ({ ...p, avgPrice: p.costUsd / p.shares }))
    .sort((a, b) => b.costUsd - a.costUsd);
}
