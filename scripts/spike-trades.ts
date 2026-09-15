// Step 3 of the spike: the shape of trades + price history for one market. ~2-4 credits.
//   node --env-file=.env scripts/spike-trades.ts <market_id>
import { nansen } from "../lib/nansen/client.ts";

const marketId = process.argv[2];
if (!marketId) throw new Error("usage: spike-trades.ts <market_id>");

interface Trade {
  timestamp: string;
  seller: string;
  buyer: string;
  taker_action: string;
  side: string;
  outcome_index: number;
  size: number;
  price: number;
  usdc_value: number;
  tx_hash: string;
}
interface Candle {
  side: string;
  outcome_index: number;
  period_start: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume_usd: number;
  trade_count: number;
  unique_traders: number;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const [trades, ohlcv] = await Promise.all([
  nansen<{ data: Trade[]; pagination: { is_last_page: boolean } }>("prediction-market/trades-by-market", {
    market_id: marketId,
    order_by: [{ field: "timestamp", direction: "ASC" }],
    pagination: { page: 1, per_page: 1000 },
  }),
  nansen<{ data: Candle[]; pagination: { is_last_page: boolean } }>("prediction-market/ohlcv", {
    market_id: marketId,
    order_by: [{ field: "period_start", direction: "ASC" }],
    pagination: { page: 1, per_page: 1000 },
  }),
]);

const t = trades.data;
console.log(`\n${t.length} trades (last page: ${trades.pagination.is_last_page}), ${t[0]?.timestamp} → ${t.at(-1)?.timestamp}`);
console.log("sample:", JSON.stringify(t[0]));
console.log("taker_action values:", [...new Set(t.map((x) => x.taker_action))]);
console.log("side values:", [...new Set(t.map((x) => x.side))]);

// price path per outcome, hourly
const c = ohlcv.data;
console.log(`\n${c.length} candles (last page: ${ohlcv.pagination.is_last_page})`);
console.log("sample:", JSON.stringify(c[0]));
for (const side of [...new Set(c.map((x) => x.side))]) {
  console.log(`\n  ${side}:`);
  for (const k of c.filter((x) => x.side === side)) {
    const bar = "█".repeat(Math.round(k.close * 40));
    console.log(`    ${k.period_start.slice(5, 16)}  ${k.open.toFixed(2)}→${k.close.toFixed(2)}  ${usd(k.volume_usd).padStart(9)} ${String(k.trade_count).padStart(4)}t ${bar}`);
  }
}

// biggest buys of the eventual winner, with price at the time
const winner = c.filter((x) => x.close >= 0.95).at(-1)?.side;
console.log(`\nwinning side (close ≥ 0.95): ${winner}`);
const big = t
  .filter((x) => x.side === winner && x.taker_action?.toLowerCase().includes("buy"))
  .sort((a, b) => b.usdc_value - a.usdc_value)
  .slice(0, 15);
console.log(`top 15 buys of ${winner} by size:`);
for (const x of big) {
  console.log(`  ${x.timestamp.slice(5, 16)}  ${short(x.buyer)}  ${usd(x.usdc_value).padStart(8)} @ ${x.price.toFixed(2)}`);
}

// how concentrated: buyers by total usd on the winning side
const byBuyer = new Map<string, { usd: number; n: number; first: string; avgPx: number }>();
for (const x of t.filter((x) => x.side === winner && x.taker_action?.toLowerCase().includes("buy"))) {
  const b = byBuyer.get(x.buyer) ?? { usd: 0, n: 0, first: x.timestamp, avgPx: 0 };
  b.avgPx = (b.avgPx * b.usd + x.price * x.usdc_value) / (b.usd + x.usdc_value);
  b.usd += x.usdc_value;
  b.n += 1;
  byBuyer.set(x.buyer, b);
}
console.log(`\n${byBuyer.size} distinct buyers of ${winner}; top 10 by total:`);
for (const [a, b] of [...byBuyer.entries()].sort((x, y) => y[1].usd - x[1].usd).slice(0, 10)) {
  console.log(`  ${short(a)}  ${usd(b.usd).padStart(8)}  ${b.n} trades  avg @ ${b.avgPx.toFixed(2)}  first ${b.first.slice(5, 16)}`);
}
