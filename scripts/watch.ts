// Watch mode: conviction building on markets that have not resolved yet.
//
//   node --experimental-strip-types --env-file=.env scripts/watch.ts [--days 7] [--max 120] [--hours 72]
//        [--tags ...] [--min-volume 20000] [--profile 15] [--dry-run]
//
// Discovery: 1 credit per tag (markets closing within `days`). Per market: ohlcv (1) for the
// current price of each side, then trades of the last `hours` (1 per 1000) for sides still
// priced at 60¢ or less. Wallets that took size cheaply and recently are scored; the top ones
// are profiled (2 each). Writes data/site/watch.json.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { creditsSpent, nansen, NansenError } from "../lib/nansen/client.ts";
import { getAddressSummary, getCandles, getTradesWindow, listActiveMarkets, type AddressSummary, type Market } from "../lib/nansen/pm.ts";
import { positionsBefore, type Position } from "../lib/screen/positions.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]);
}
const days = Number(args.get("days") ?? 7);
const hours = Number(args.get("hours") ?? 72);
const maxMarkets = Number(args.get("max") ?? 120);
const minVolume = Number(args.get("min-volume") ?? 20_000);
const profileN = Number(args.get("profile") ?? 15);
const tags = (args.get("tags") ?? "Politics,Geopolitics,World,Crypto,Business,Science").split(",");
const dryRun = args.get("dry-run") === "true";

const NOISE = /^(sports|games|tweet markets|recurring|mentions|rogan|lid|trump daily|esports|crypto prices|weather|natural disasters|temperature)$/i;
const NUMERIC = /\b(above|below|dips? (below|under)|hits?|reach(es)?|close[sd]? (above|below)|between)\b.*\$|\bexactly \d|\b\d+(\.\d+)?%|magnitude|\btemperature|\bhigh(est)? temp|\d+ ?(bps|basis points)|market cap|all[- ]time high|\b(FDV|TVL)\b|(\d+|more|fewer|less) (or more |or fewer )?(ships|posts|tweets|cases|transits)/i;

const HOUR = 3_600_000, DAY = 24 * HOUR;
const now = Date.now();
const nowIso = new Date(now).toISOString().slice(0, 19);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface WatchFlag {
  wallet: string;
  side: string;
  score: number;
  position: Position;
  currentPrice: number;
  hoursSinceLastBuy: number;
  factors: { name: "size" | "odds" | "recency" | "share"; value: number; detail: string }[];
  summary?: AddressSummary | null;
}
export interface WatchedMarket {
  market: Pick<Market, "market_id" | "question" | "event_title" | "end_date" | "tags" | "volume" | "slug">;
  prices: Record<string, number>;
  recentUsd: number;
  recentWallets: number;
  flags: WatchFlag[];
  skipped?: string;
}

/** Like the post-hoc score, with recency in place of timing: the news has not happened yet. */
function scoreLive(p: Position, side: string, currentPrice: number, sideUsd: number): WatchFlag {
  const hrs = (now - new Date(p.lastBuyAt + "Z").getTime()) / HOUR;
  const size = clamp((Math.log10(Math.max(p.costUsd, 1)) - 2) / 2);
  const odds = clamp((0.5 - p.avgPrice) / 0.45);
  const recency = clamp(1 - Math.log10(Math.max(hrs, 1)) / 2);
  const share = sideUsd > 0 ? clamp(p.costUsd / sideUsd) : 0;
  const score = Math.round(100 * size * (0.45 * odds + 0.35 * recency + 0.2 * share));
  return {
    wallet: p.wallet, side, score, position: p, currentPrice, hoursSinceLastBuy: hrs,
    factors: [
      { name: "size", value: size, detail: `${usd(p.costUsd)} at risk` },
      { name: "odds", value: odds, detail: `bought at ${p.avgPrice.toFixed(2)}, market now at ${currentPrice.toFixed(2)}` },
      { name: "recency", value: recency, detail: `last buy ${hrs < 48 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(0)}d`} ago` },
      { name: "share", value: share, detail: `${(share * 100).toFixed(0)}% of the last ${hours}h of money on ${side}` },
    ],
  };
}

// 1. discovery
const seen = new Map<string, Market>();
const endsAfter = new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z";
const endsBefore = new Date(now + days * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z";
for (const tag of tags) {
  for (const m of await listActiveMarkets({ tag, endsAfter, endsBefore })) if (!seen.has(m.market_id)) seen.set(m.market_id, m);
}
const candidates = [...seen.values()]
  .filter((m) => m.volume >= minVolume && !m.closed)
  .filter((m) => !(m.tags ?? []).some((t) => NOISE.test(t)) && !NUMERIC.test(m.question))
  .sort((a, b) => b.volume - a.volume)
  .slice(0, maxMarkets);
console.error(`\n${seen.size} open markets closing by ${endsBefore.slice(0, 10)}; ${candidates.length} after filters; ~${candidates.length * 3 + profileN * 2} credits; spent ${creditsSpent()}`);
if (dryRun) {
  for (const m of candidates) console.log(`${m.market_id.padEnd(8)} ${m.end_date.slice(0, 10)} ${usd(m.volume).padStart(11)}  ${m.question.slice(0, 80)}`);
  process.exit(0);
}

// 2. per market
const results: WatchedMarket[] = [];
let stopped: string | null = null;
for (const m of candidates) {
  const base = { market: { market_id: m.market_id, question: m.question, event_title: m.event_title, end_date: m.end_date, tags: m.tags, volume: m.volume, slug: m.slug } };
  try {
    const candles = await getCandles(m.market_id, 2);
    const sides = [...new Set(candles.map((c) => c.side))];
    const prices: Record<string, number> = {};
    for (const s of sides) prices[s] = candles.filter((c) => c.side === s).sort((a, b) => a.period_start.localeCompare(b.period_start)).at(-1)?.close ?? 0;
    const unlikely = sides.filter((s) => prices[s] > 0.01 && prices[s] <= 0.6);
    if (sides.length !== 2 || unlikely.length === 0) { results.push({ ...base, prices, recentUsd: 0, recentWallets: 0, flags: [], skipped: "no side still unlikely" }); continue; }

    const { trades } = await getTradesWindow(m.market_id, new Date(now - hours * HOUR).toISOString().slice(0, 19), nowIso, 3);
    const flags: WatchFlag[] = [];
    let recentUsd = 0, recentWallets = 0;
    for (const side of unlikely) {
      const positions = positionsBefore(trades, side, "9999").filter((p) => p.avgPrice <= 0.55);
      const sideUsd = positions.reduce((s, p) => s + p.costUsd, 0);
      recentUsd += sideUsd; recentWallets += positions.length;
      for (const p of positions.slice(0, 10)) if (p.costUsd >= 500) flags.push(scoreLive(p, side, prices[side], sideUsd));
    }
    flags.sort((a, b) => b.score - a.score);
    results.push({ ...base, prices, recentUsd, recentWallets, flags: flags.slice(0, 8) });
    const f = flags[0];
    console.error(`  ${f ? String(f.score).padStart(3) : "  -"}  ${m.question.slice(0, 60).padEnd(60)} ${f ? `${short(f.wallet)} ${usd(f.position.costUsd)} on ${f.side} @${f.position.avgPrice.toFixed(2)} (now ${f.currentPrice.toFixed(2)})` : ""}`);
  } catch (error) {
    if (error instanceof NansenError && /budget/.test(error.message)) { stopped = error.message; break; }
    console.error(`  ! ${m.market_id} ${(error as Error).message.split("\n")[0]}`);
  }
}

// 3. profile the top wallets
const top = results.flatMap((r) => r.flags).sort((a, b) => b.score - a.score).slice(0, profileN);
const cache = new Map<string, AddressSummary | null>();
for (const f of top) {
  if (stopped) break;
  try {
    if (!cache.has(f.wallet)) cache.set(f.wallet, await getAddressSummary(f.wallet));
  } catch (error) {
    if (error instanceof NansenError && /budget/.test(error.message)) { stopped = error.message; break; }
  }
}
for (const r of results) for (const f of r.flags) if (cache.has(f.wallet)) f.summary = cache.get(f.wallet);

// 4. write
if (!existsSync("data/site")) mkdirSync("data/site", { recursive: true });
const out = { ranAt: new Date(now).toISOString(), params: { days, hours, maxMarkets, minVolume, tags }, results };
writeFileSync("data/site/watch.json", JSON.stringify(out, null, 2));

const ranked = results.filter((r) => r.flags[0]).sort((a, b) => b.flags[0].score - a.flags[0].score);
console.log(`\n${results.length} markets watched, ${ranked.length} with someone taking size cheaply in the last ${hours}h\n`);
for (const r of ranked.slice(0, 25)) {
  const f = r.flags[0]; const s = f.summary;
  console.log(`  ${String(f.score).padStart(3)}  ${r.market.question.slice(0, 55).padEnd(55)} ${short(f.wallet)} ${usd(f.position.costUsd).padStart(8)} on ${f.side.padEnd(4)} @${f.position.avgPrice.toFixed(2)} now ${f.currentPrice.toFixed(2)}  ${f.hoursSinceLastBuy.toFixed(0)}h ago${s ? `  · ${s.markets_traded} mkts, first seen ${s.first_seen.slice(0, 10)}` : ""}`);
}
if (stopped) console.log(`\nstopped: ${stopped}`);
console.log(`\ncredits spent in total: ${creditsSpent()}\nwritten data/site/watch.json`);
