// Wallets that move together, from cached data only. Writes data/site/clusters.json.
//
//   node scripts/clusters.ts
//
// Three signals: the same wallet flagged in several markets; two wallets in one market whose
// buying starts and stops within minutes of each other — as takers, never sharing a fill, so a
// single order sweeping several resting makers does not pass as a coordinated pair; and wallets
// whose owners share a first funder.
import { writeFileSync } from "node:fs";
import { loadRun, tradesFor, type MarketRecord } from "../lib/store.ts";
import type { Flag } from "../lib/screen/score.ts";

const MIN_USD = 1_000;
const MIN_SCORE = 25;
const WINDOW_MIN = 30;

export interface Repeater {
  wallet: string;
  markets: { market_id: string; question: string; end_date: string; score: number; costUsd: number }[];
}
export interface Twin {
  market_id: string;
  question: string;
  wallets: { wallet: string; score: number; costUsd: number; firstBuyAt: string; lastBuyAt: string; takerShare: number }[];
  deltaFirstMin: number;
  deltaLastMin: number;
  sameFirstSeen?: string;
  /** strong: created the same day, or start and stop within 5 minutes. weak: same 30-minute window — often just the same headline. */
  strength: "strong" | "weak";
}
export interface SharedFunder {
  funder: string;
  funderName: string | null;
  wallets: string[];
}
export interface Clusters {
  builtAt: string;
  repeaters: Repeater[];
  twins: Twin[];
  sharedFunders: SharedFunder[];
}

const ms = (s: string) => new Date(s + "Z").getTime();
const minutes = (a: string, b: string) => Math.abs(ms(a) - ms(b)) / 60_000;

/** Fraction of a wallet's pre-news exposure taken aggressively, and the fills it was part of. */
function takerProfile(r: MarketRecord, wallet: string, newsAt: string) {
  const w = wallet.toLowerCase();
  let taker = 0, maker = 0;
  const txs = new Set<string>();
  for (const t of tradesFor(r.market.market_id)) {
    if (t.timestamp >= newsAt) continue;
    const onWinner = t.side === r.winner;
    const long = (onWinner ? t.buyer : t.seller).toLowerCase();
    if (long !== w) continue;
    const isTaker = (onWinner && t.taker_action === "buy") || (!onWinner && t.taker_action === "sell");
    const v = t.size * (onWinner ? t.price : 1 - t.price);
    if (isTaker) taker += v; else maker += v;
    txs.add(t.tx_hash);
  }
  return { takerShare: taker + maker > 0 ? taker / (taker + maker) : 0, txs };
}

const run = loadRun();
const results = run.results as MarketRecord[];

// 1. repeaters
const byWallet = new Map<string, Repeater["markets"]>();
for (const r of results) {
  for (const f of r.flags) {
    if (f.score < MIN_SCORE || f.position.costUsd < MIN_USD) continue;
    const list = byWallet.get(f.wallet) ?? [];
    list.push({ market_id: r.market.market_id, question: r.market.question, end_date: r.market.end_date, score: f.score, costUsd: f.position.costUsd });
    byWallet.set(f.wallet, list);
  }
}
const repeaters: Repeater[] = [...byWallet.entries()]
  .filter(([, m]) => m.length >= 2)
  .map(([wallet, markets]) => ({ wallet, markets: markets.sort((a, b) => b.score - a.score) }))
  .sort((a, b) => b.markets[0].score - a.markets[0].score);

// 2. twins
const twins: Twin[] = [];
for (const r of results) {
  if (!r.jump) continue;
  const newsAt = r.jump.newsAt ?? r.jump.at;
  const eligible: Flag[] = r.flags.filter((f) => f.position.costUsd >= MIN_USD);
  if (eligible.length < 2) continue;
  const profiles = new Map(eligible.map((f) => [f.wallet, takerProfile(r, f.wallet, newsAt)]));

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i], b = eligible[j];
      const dFirst = minutes(a.position.firstBuyAt, b.position.firstBuyAt);
      const dLast = minutes(a.position.lastBuyAt, b.position.lastBuyAt);
      const sa = r.dossiers?.[a.wallet]?.summary?.first_seen, sb = r.dossiers?.[b.wallet]?.summary?.first_seen;
      const sameDay = !!sa && sa === sb;
      if (dLast > WINDOW_MIN || (dFirst > WINDOW_MIN && !sameDay)) continue;
      const pa = profiles.get(a.wallet)!, pb = profiles.get(b.wallet)!;
      if (pa.takerShare < 0.5 || pb.takerShare < 0.5) continue;
      if ([...pa.txs].some((tx) => pb.txs.has(tx))) continue;

      twins.push({
        strength: sameDay || (dFirst <= 5 && dLast <= 5) ? "strong" : "weak",
        market_id: r.market.market_id,
        question: r.market.question,
        wallets: [a, b].map((f) => ({ wallet: f.wallet, score: f.score, costUsd: f.position.costUsd, firstBuyAt: f.position.firstBuyAt, lastBuyAt: f.position.lastBuyAt, takerShare: profiles.get(f.wallet)!.takerShare })),
        deltaFirstMin: Math.round(dFirst),
        deltaLastMin: Math.round(dLast),
        sameFirstSeen: sameDay ? sa : undefined,
      });
    }
  }
}
twins.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1) || Math.max(...b.wallets.map((w) => w.score)) - Math.max(...a.wallets.map((w) => w.score)));

// 3. shared first funders
const byFunder = new Map<string, SharedFunder>();
for (const r of results) {
  for (const [wallet, t] of Object.entries(r.traces ?? {})) {
    if (!t.funder) continue;
    const key = t.funder.first_funder_address.toLowerCase();
    const s = byFunder.get(key) ?? { funder: t.funder.first_funder_address, funderName: t.funder.first_funder_name || null, wallets: [] };
    if (!s.wallets.includes(wallet)) s.wallets.push(wallet);
    byFunder.set(key, s);
  }
}
const sharedFunders = [...byFunder.values()].filter((s) => s.wallets.length > 1);

const out: Clusters = { builtAt: new Date().toISOString(), repeaters, twins, sharedFunders };
writeFileSync("data/site/clusters.json", JSON.stringify(out, null, 2));
console.log(`${repeaters.length} repeaters, ${twins.length} twin pairs, ${sharedFunders.length} shared funders → data/site/clusters.json`);
for (const t of twins.slice(0, 10)) console.log(`  ${t.strength.padEnd(6)} ${t.question.slice(0, 50).padEnd(50)} ${t.wallets.map((w) => `${w.wallet.slice(0, 8)} $${Math.round(w.costUsd)} (${Math.round(w.takerShare * 100)}% taker)`).join("  ")}  Δ${t.deltaFirstMin}/${t.deltaLastMin}m${t.sameFirstSeen ? `  both first seen ${t.sameFirstSeen}` : ""}`);
