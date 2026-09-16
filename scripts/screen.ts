// Screen closed Polymarket markets for pre-news conviction.
//
//   node --env-file=.env scripts/screen.ts [--from 2022-11-01] [--to today] [--window 90]
//       [--tags Politics,Geopolitics,...] [--min-volume 5000] [--min-surprise 0.4]
//       [--resolved yes|no|any] [--lookback 14] [--markets id,id] [--dry-run]
//
// Discovery: 1 credit per tag per window. Per market: ohlcv (1 per 1000 candles) and, only
// when the market was genuinely surprised, trades in the `lookback` days before each news
// moment (1 per 1000). Stops at NANSEN_MAX_CREDITS. Every response is cached; results are
// saved every few markets to data/screen/latest.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { creditsSpent, NansenError } from "../lib/nansen/client.ts";
import { getCandles, getTradesWindow, listClosedMarkets, type Market } from "../lib/nansen/pm.ts";
import { findJumps, type Jump } from "../lib/screen/jump.ts";
import { newsMoment } from "../lib/screen/news.ts";
import { positionsBefore } from "../lib/screen/positions.ts";
import { scorePosition, type Flag } from "../lib/screen/score.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]);
}
const today = new Date().toISOString().slice(0, 10);
const from = args.get("from") ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
const to = args.get("to") ?? today;
const windowDays = Number(args.get("window") ?? 90);
const tags = (args.get("tags") ?? "Politics,Geopolitics,World,Crypto,Business,Science").split(",");
const minVolume = Number(args.get("min-volume") ?? 5_000);
const minSurprise = Number(args.get("min-surprise") ?? 0.4);
const lookbackDays = Number(args.get("lookback") ?? 14);
const dryRun = args.get("dry-run") === "true";
const onlyMarkets = args.get("markets")?.split(",");
// "yes": something happened (YES ≥ 0.9). NO-by-expiry markets never jump and cannot be known in advance.
const resolved = args.get("resolved") ?? "yes";
const OUT = "data/screen/latest.json";

// Markets whose structure cannot carry private information: live events and
// recurring count-the-posts markets.
const NOISE = /^(sports|games|tweet markets|recurring|mentions|rogan|lid|trump daily|esports)$/i;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const DAY = 86_400_000;

export interface ScreenedMarket {
  market: Pick<Market, "market_id" | "question" | "event_title" | "end_date" | "tags" | "volume" | "slug">;
  winner: string;
  jumps: Jump[];
  /** The jump we scored against: the one with the strongest flag. */
  jump: Jump | null;
  skipped?: string;
  preJumpUsd: number;
  preJumpWallets: number;
  tradesComplete: boolean;
  flags: Flag[];
}

// 1. discovery, one 1-credit call per tag per window --------------------------
const seen = new Map<string, Market>();
for (let start = new Date(from + "T00:00:00Z").getTime(); start < new Date(to + "T00:00:00Z").getTime(); start += windowDays * DAY) {
  const endedAfter = new Date(start).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const endedBefore = new Date(Math.min(start + windowDays * DAY, new Date(to + "T00:00:00Z").getTime())).toISOString().slice(0, 10) + "T00:00:00.000Z";
  for (const tag of tags) {
    const list = await listClosedMarkets({ tag, endedAfter, endedBefore, perPage: 500 });
    for (const m of list) if (!seen.has(m.market_id)) seen.set(m.market_id, m);
  }
}
if (onlyMarkets) for (const id of [...seen.keys()]) if (!onlyMarkets.includes(id)) seen.delete(id);

const candidates = [...seen.values()]
  .filter((m) => m.volume >= minVolume)
  .filter((m) => onlyMarkets || !(m.tags ?? []).some((t) => NOISE.test(t)))
  .filter((m) => resolved === "any" || (resolved === "yes" ? m.last_trade_price >= 0.9 : m.last_trade_price <= 0.1))
  // --markets keeps the caller's order so the budget runs out on the least interesting ones.
  .sort((a, b) => (onlyMarkets ? onlyMarkets.indexOf(a.market_id) - onlyMarkets.indexOf(b.market_id) : b.volume - a.volume));

console.error(`\n${seen.size} closed markets, ${from} → ${to}, ${tags.length} tags; ${candidates.length} after filters (≥ ${usd(minVolume)}, resolved ${resolved}, no live/recurring)`);
console.error(`estimated cost: ~${Math.round(candidates.length * 1.6)} credits; spent so far ${creditsSpent()}`);
if (dryRun) {
  for (const m of candidates) console.log(`${m.market_id.padEnd(8)} ${m.end_date.slice(0, 10)} ${usd(m.volume).padStart(12)}  ${m.question.slice(0, 80)}`);
  process.exit(0);
}

// 2. per market, resuming from a previous run ---------------------------------
const previous: ScreenedMarket[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { results: ScreenedMarket[] }).results : [];
const results = new Map(previous.map((r) => [r.market.market_id, r]));
let stopped: string | null = null;
let n = 0;

function save() {
  if (!existsSync("data/screen")) mkdirSync("data/screen", { recursive: true });
  const out = { ranAt: new Date().toISOString(), params: { from, to, windowDays, tags, minVolume, minSurprise, resolved, lookbackDays }, results: [...results.values()] };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
}

async function screenOne(m: Market): Promise<ScreenedMarket> {
  const base = {
    market: { market_id: m.market_id, question: m.question, event_title: m.event_title, end_date: m.end_date, tags: m.tags, volume: m.volume, slug: m.slug },
  };
  const shape = findJumps(await getCandles(m.market_id));
  if (!shape) return { ...base, winner: "?", jumps: [], jump: null, skipped: "did not resolve cleanly", preJumpUsd: 0, preJumpWallets: 0, tradesComplete: true, flags: [] };

  const surprising = shape.jumps.filter((j) => 1 - j.priceBefore >= minSurprise);
  if (surprising.length === 0) return { ...base, winner: shape.winner, jumps: shape.jumps, jump: null, skipped: `no surprise ≥ ${minSurprise}`, preJumpUsd: 0, preJumpWallets: 0, tradesComplete: true, flags: [] };

  // Score each surprising jump on the trades of the days before it; keep the strongest.
  let best: { jump: Jump; flags: Flag[]; preUsd: number; wallets: number; complete: boolean } | null = null;
  for (const jump of surprising.slice(-3)) {
    const jumpMs = new Date(jump.at + "Z").getTime();
    const { trades, complete } = await getTradesWindow(m.market_id, iso(jumpMs - lookbackDays * DAY), iso(jumpMs + 3_600_000));
    jump.newsAt = newsMoment(trades, shape.winner, jump);
    const positions = positionsBefore(trades, shape.winner, jump.newsAt);
    const preUsd = positions.reduce((s, p) => s + p.costUsd, 0);
    const flags = positions.slice(0, 25).map((p) => scorePosition(p, jump, preUsd)).sort((a, b) => b.score - a.score);
    if (!best || (flags[0]?.score ?? 0) > (best.flags[0]?.score ?? 0)) best = { jump, flags, preUsd, wallets: positions.length, complete };
  }
  return { ...base, winner: shape.winner, jumps: shape.jumps, jump: best!.jump, preJumpUsd: best!.preUsd, preJumpWallets: best!.wallets, tradesComplete: best!.complete, flags: best!.flags.slice(0, 10) };
}

const queue = candidates.filter((m) => !results.has(m.market_id));
console.error(`${queue.length} to screen, ${candidates.length - queue.length} already in ${OUT}`);

async function worker() {
  while (queue.length && !stopped) {
    const m = queue.shift()!;
    try {
      const r = await screenOne(m);
      results.set(m.market_id, r);
      const f = r.flags[0];
      console.error(`  ${String(++n).padStart(4)}/${candidates.length}  ${f ? String(f.score).padStart(3) : r.skipped ? " --" : "  0"}  ${m.question.slice(0, 70)}`);
      if (n % 10 === 0) save();
    } catch (error) {
      if (error instanceof NansenError && /budget/.test(error.message)) { stopped = error.message; queue.unshift(m); break; }
      console.error(`  ! ${m.market_id} ${(error as Error).message.split("\n")[0]}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
save();

// 3. report ---------------------------------------------------------------
const all = candidates.map((m) => results.get(m.market_id)).filter((r): r is ScreenedMarket => !!r);
const scored = all.filter((r) => r.jump && r.flags[0]).sort((a, b) => b.flags[0].score - a.flags[0].score);
console.log(`\n${all.length} markets examined, ${all.filter((r) => r.jump).length} had a surprise worth checking\n`);
console.log("score  market                                                       news moment       before  top wallet     at risk  avg px  lead");
for (const r of scored.slice(0, 40)) {
  const f = r.flags[0];
  const lead = f.factors.find((x) => x.name === "timing")!.detail.replace("last buy ", "").replace(" before the news", "");
  console.log(`  ${String(f.score).padStart(3)}  ${r.market.question.slice(0, 60).padEnd(60)} ${(r.jump!.newsAt ?? r.jump!.at).slice(0, 16)}  ${r.jump!.priceBefore.toFixed(2)}    ${short(f.wallet)}  ${usd(f.position.costUsd).padStart(8)}  ${f.position.avgPrice.toFixed(2)}    ${lead}`);
}
if (stopped) console.log(`\nstopped: ${stopped}`);
console.log(`\ncredits spent in total: ${creditsSpent()}\nwritten ${OUT}`);
