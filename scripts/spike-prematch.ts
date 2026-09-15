// Step 4: pull every trade page and split pre-match from in-play. ~1 credit per 1000 trades.
//   node --env-file=.env scripts/spike-prematch.ts <market_id>
import { nansen } from "../lib/nansen/client.ts";

const marketId = process.argv[2];
if (!marketId) throw new Error("usage: spike-prematch.ts <market_id>");

interface Trade { timestamp: string; seller: string; buyer: string; taker_action: string; side: string; size: number; price: number; usdc_value: number }
interface Candle { side: string; period_start: string; close: number; volume_usd: number; trade_count: number }

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const all: Trade[] = [];
for (let page = 1; page <= 20; page++) {
  const res = await nansen<{ data: Trade[]; pagination: { is_last_page: boolean } }>("prediction-market/trades-by-market", {
    market_id: marketId,
    order_by: [{ field: "timestamp", direction: "ASC" }],
    pagination: { page, per_page: 1000 },
  });
  all.push(...res.data);
  if (res.pagination.is_last_page) break;
}
const ohlcv = await nansen<{ data: Candle[] }>("prediction-market/ohlcv", {
  market_id: marketId,
  order_by: [{ field: "period_start", direction: "ASC" }],
  pagination: { page: 1, per_page: 1000 },
});

// Match start ≈ first hour whose trade count is ≥ 10× the median of the hours before it.
const hours = [...new Set(ohlcv.data.map((c) => c.period_start))].sort();
const countAt = (h: string) => ohlcv.data.filter((c) => c.period_start === h).reduce((s, c) => s + c.trade_count, 0);
let matchStart = hours.at(-1)!;
for (let i = 1; i < hours.length; i++) {
  const prior = hours.slice(0, i).map(countAt).sort((a, b) => a - b);
  const median = prior[Math.floor(prior.length / 2)] || 1;
  if (countAt(hours[i]) >= 10 * median && countAt(hours[i]) >= 50) { matchStart = hours[i]; break; }
}
const winner = ohlcv.data.filter((c) => c.close >= 0.95).at(-1)?.side;

const pre = all.filter((t) => t.timestamp < matchStart);
const live = all.filter((t) => t.timestamp >= matchStart);
const vol = (ts: Trade[]) => ts.reduce((s, t) => s + t.usdc_value, 0);

console.log(`\n${all.length} trades total. winner: ${winner}. match start ≈ ${matchStart}`);
console.log(`pre-match: ${pre.length} trades, ${usd(vol(pre))}   in-play: ${live.length} trades, ${usd(vol(live))}`);

// Every pre-match buyer, both sides, ranked by size — this is the whole candidate set.
type Agg = { usd: number; n: number; first: string; last: string; avgPx: number };
const agg = new Map<string, Agg>();
for (const t of pre) {
  const key = `${t.buyer}|${t.side}`;
  const a = agg.get(key) ?? { usd: 0, n: 0, first: t.timestamp, last: t.timestamp, avgPx: 0 };
  a.avgPx = (a.avgPx * a.usd + t.price * t.usdc_value) / (a.usd + t.usdc_value);
  a.usd += t.usdc_value; a.n += 1; a.last = t.timestamp;
  agg.set(key, a);
}
console.log(`\npre-match buyers (${agg.size}), by size:`);
for (const [key, a] of [...agg.entries()].sort((x, y) => y[1].usd - x[1].usd).slice(0, 20)) {
  const [addr, side] = key.split("|");
  const won = side === winner ? "WON " : "lost";
  console.log(`  ${won} ${short(addr)}  ${usd(a.usd).padStart(8)} on ${side.padEnd(13)} avg @ ${a.avgPx.toFixed(2)}  ${a.n} trades  ${a.first.slice(5, 16)} → ${a.last.slice(5, 16)}`);
}

// Where did the market's biggest winners actually trade?
const known = ["0xdd7e989aee938a94a878256f00d1121be1760be3", "0x75f2", "0x41bb", "0xfd74"];
console.log(`\nbiggest pnl winners — when did they buy ${winner}?`);
for (const k of known) {
  const mine = all.filter((t) => t.buyer.startsWith(k) && t.side === winner);
  if (!mine.length) continue;
  const p = mine.filter((t) => t.timestamp < matchStart), l = mine.filter((t) => t.timestamp >= matchStart);
  console.log(`  ${short(mine[0].buyer)}  pre ${usd(vol(p))} (${p.length}t)  in-play ${usd(vol(l))} (${l.length}t)  first ${mine[0].timestamp.slice(5, 16)}`);
}
