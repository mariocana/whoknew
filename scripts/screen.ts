// Screen closed Polymarket markets for pre-news conviction.
//
//   node --env-file=.env scripts/screen.ts [--tags Politics,Geopolitics] [--days 90] [--per-tag 50]
//                                          [--min-volume 5000] [--min-surprise 0.4] [--dry-run]
//
// Per market: 1 credit (ohlcv) + 1 per 1000 trades before the news hour, only when the
// market was genuinely surprised. Stops at NANSEN_MAX_CREDITS. Everything is cached.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { creditsSpent, NansenError } from "../lib/nansen/client.ts";
import { getCandles, getTradesUntil, listClosedMarkets, type Market } from "../lib/nansen/pm.ts";
import { findJumps, type Jump } from "../lib/screen/jump.ts";
import { newsMoment } from "../lib/screen/news.ts";
import { positionsBefore } from "../lib/screen/positions.ts";
import { scorePosition, type Flag } from "../lib/screen/score.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]);
}
const tags = (args.get("tags") ?? "Politics,Geopolitics,World,Crypto,Business,Science").split(",");
const days = Number(args.get("days") ?? 90);
const perTag = Number(args.get("per-tag") ?? 50);
const minVolume = Number(args.get("min-volume") ?? 5_000);
const minSurprise = Number(args.get("min-surprise") ?? 0.4);
const dryRun = args.get("dry-run") === "true";
const onlyMarkets = args.get("markets")?.split(",");
// "yes": something happened (YES ≥ 0.9). NO-by-expiry markets never jump and cannot be known in advance.
const resolved = args.get("resolved") ?? "yes";

// Markets whose structure cannot carry private information: live events and
// recurring count-the-posts markets.
const NOISE = /^(sports|games|tweet markets|recurring|mentions|rogan|lid|trump daily|esports)$/i;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface ScreenedMarket {
  market: Pick<Market, "market_id" | "question" | "event_title" | "end_date" | "tags" | "volume" | "slug">;
  winner: string;
  jumps: Jump[];
  /** The jump we scored against: the biggest surprise. */
  jump: Jump | null;
  skipped?: string;
  preJumpUsd: number;
  preJumpWallets: number;
  tradesComplete: boolean;
  flags: Flag[];
}

// 1. discovery ------------------------------------------------------------
// Day-rounded so the same run on the same day is a cache hit.
const endedAfter = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
const seen = new Map<string, Market>();
for (const tag of tags) {
  const list = await listClosedMarkets({ tag, endedAfter, perPage: perTag });
  for (const m of list) if (!seen.has(m.market_id)) seen.set(m.market_id, m);
}
if (onlyMarkets) for (const id of [...seen.keys()]) if (!onlyMarkets.includes(id)) seen.delete(id);
const candidates = [...seen.values()]
  .filter((m) => m.volume >= minVolume)
  .filter((m) => onlyMarkets || !(m.tags ?? []).some((t) => NOISE.test(t)))
  .filter((m) => resolved === "any" || (resolved === "yes" ? m.last_trade_price >= 0.9 : m.last_trade_price <= 0.1))
  // --markets keeps the caller's order so the budget runs out on the least interesting ones.
  .sort((a, b) => (onlyMarkets ? onlyMarkets.indexOf(a.market_id) - onlyMarkets.indexOf(b.market_id) : b.volume - a.volume));

console.error(`\n${seen.size} closed markets across ${tags.length} tags, ${candidates.length} after filters (≥ ${usd(minVolume)}, no live/recurring)`);
console.error(`estimated cost: ${candidates.length} (ohlcv) + ~${Math.round(candidates.length * 0.5)} (trades on surprised ones) credits; spent so far ${creditsSpent()}`);
if (dryRun) {
  for (const m of candidates) console.log(`${m.market_id.padEnd(8)} ${m.end_date.slice(0, 10)} ${usd(m.volume).padStart(12)}  ${m.question.slice(0, 80)}`);
  process.exit(0);
}

// 2. per market -----------------------------------------------------------
const results: ScreenedMarket[] = [];
let stopped: string | null = null;

for (const m of candidates) {
  const base = {
    market: { market_id: m.market_id, question: m.question, event_title: m.event_title, end_date: m.end_date, tags: m.tags, volume: m.volume, slug: m.slug },
  };
  try {
    const shape = findJumps(await getCandles(m.market_id));
    if (!shape) {
      results.push({ ...base, winner: "?", jumps: [], jump: null, skipped: "did not resolve cleanly", preJumpUsd: 0, preJumpWallets: 0, tradesComplete: true, flags: [] });
      continue;
    }
    const surprising = shape.jumps.filter((j) => 1 - j.priceBefore >= minSurprise);
    if (surprising.length === 0) {
      results.push({ ...base, winner: shape.winner, jumps: shape.jumps, jump: null, skipped: `no surprise ≥ ${minSurprise}`, preJumpUsd: 0, preJumpWallets: 0, tradesComplete: true, flags: [] });
      continue;
    }

    // Trades up to the last surprising jump cover every earlier one too.
    const lastJump = surprising.at(-1)!;
    const { trades, complete } = await getTradesUntil(m.market_id, lastJump.at);

    // Score each surprising jump; keep the one with the strongest flag.
    let best: { jump: Jump; flags: Flag[]; preUsd: number; wallets: number } | null = null;
    for (const jump of surprising) {
      jump.newsAt = newsMoment(trades, shape.winner, jump);
      const positions = positionsBefore(trades, shape.winner, jump.newsAt);
      const preUsd = positions.reduce((s, p) => s + p.costUsd, 0);
      const flags = positions.slice(0, 25).map((p) => scorePosition(p, jump, preUsd)).sort((a, b) => b.score - a.score);
      if (!best || (flags[0]?.score ?? 0) > (best.flags[0]?.score ?? 0)) best = { jump, flags, preUsd, wallets: positions.length };
    }

    results.push({ ...base, winner: shape.winner, jumps: shape.jumps, jump: best!.jump, preJumpUsd: best!.preUsd, preJumpWallets: best!.wallets, tradesComplete: complete, flags: best!.flags.slice(0, 10) });
  } catch (error) {
    if (error instanceof NansenError && /budget/.test(error.message)) { stopped = error.message; break; }
    console.error(`  ! ${m.market_id} ${(error as Error).message.split("\n")[0]}`);
  }
}

// 3. report ---------------------------------------------------------------
const scored = results.filter((r) => r.jump).sort((a, b) => (b.flags[0]?.score ?? 0) - (a.flags[0]?.score ?? 0));
console.log(`\n${results.length} markets examined, ${scored.length} had a surprise worth checking, ${results.length - scored.length} skipped\n`);
console.log("score  market                                                       news moment       before  top wallet     at risk  avg px  lead");
for (const r of scored) {
  const f = r.flags[0];
  if (!f) { console.log(`   --  ${r.market.question.slice(0, 60).padEnd(60)} ${r.jump!.at.slice(0, 16)}  ${r.jump!.priceBefore.toFixed(2)}    (nobody long before the news)`); continue; }
  const lead = f.factors.find((x) => x.name === "timing")!.detail.replace("last buy ", "").replace(" before the news", "");
  console.log(`  ${String(f.score).padStart(3)}  ${r.market.question.slice(0, 60).padEnd(60)} ${(r.jump!.newsAt ?? r.jump!.at).slice(0, 16)}  ${r.jump!.priceBefore.toFixed(2)}    ${short(f.wallet)}  ${usd(f.position.costUsd).padStart(8)}  ${f.position.avgPrice.toFixed(2)}    ${lead}`);
}
if (stopped) console.log(`\nstopped: ${stopped}`);
console.log(`\ncredits spent in total: ${creditsSpent()}`);

if (!existsSync("data/screen")) mkdirSync("data/screen", { recursive: true });
const out = { ranAt: new Date().toISOString(), params: { tags, days, perTag, minVolume, minSurprise }, results };
writeFileSync("data/screen/latest.json", JSON.stringify(out, null, 2));
writeFileSync(`data/screen/${out.ranAt.slice(0, 19).replace(/[:T]/g, "-")}.json`, JSON.stringify(out, null, 2));
console.log("written data/screen/latest.json");
