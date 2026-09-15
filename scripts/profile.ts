// Stage 2: profile the wallets the screener flagged. 2 credits per wallet.
//
//   node --env-file=.env scripts/profile.ts [--min-score 30] [--max-wallets 20]
//
// Reads data/screen/latest.json, adds a dossier per flagged wallet, writes it back.
import { readFileSync, writeFileSync } from "node:fs";
import { creditsSpent, nansen, NansenError } from "../lib/nansen/client.ts";
import { getAddressSummary, type AddressSummary } from "../lib/nansen/pm.ts";
import type { ScreenedMarket } from "./screen.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]);
}
const minScore = Number(args.get("min-score") ?? 30);
const maxWallets = Number(args.get("max-wallets") ?? 20);

interface History {
  market_id: string;
  question: string;
  side_held: string;
  net_buy_cost_usd: number;
  total_pnl_usd: number;
  market_resolved: boolean;
}

export interface Dossier {
  summary: AddressSummary | null;
  history: History[];
  /** Derived: how much of this wallet's lifetime is this one bet. */
  oneShot: boolean;
  fetchedAt: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const file = "data/screen/latest.json";
const run = JSON.parse(readFileSync(file, "utf8")) as { results: (ScreenedMarket & { dossiers?: Record<string, Dossier> })[] };

const targets = run.results
  .flatMap((r) => r.flags.map((f) => ({ r, f })))
  .filter(({ f }) => f.score >= minScore)
  .sort((a, b) => b.f.score - a.f.score)
  .slice(0, maxWallets);

console.error(`${targets.length} wallets with score ≥ ${minScore}; ~${targets.length * 2} credits; spent so far ${creditsSpent()}`);

for (const { r, f } of targets) {
  r.dossiers ??= {};
  if (r.dossiers[f.wallet]) continue;
  try {
    const [summary, hist] = await Promise.all([
      getAddressSummary(f.wallet),
      nansen<{ data: History[] }>("prediction-market/pnl-by-address", {
        address: f.wallet,
        order_by: [{ field: "total_pnl_usd", direction: "DESC" }],
        pagination: { page: 1, per_page: 25 },
      }),
    ]);
    const history = hist.data;
    const oneShot = (summary?.markets_traded ?? history.length) <= 2;
    r.dossiers[f.wallet] = { summary, history, oneShot, fetchedAt: new Date().toISOString() };

    const s = summary;
    console.log(
      `\n${String(f.score).padStart(3)}  ${short(f.wallet)}  ${r.market.question.slice(0, 60)}\n` +
        `     ${usd(f.position.costUsd)} at ${f.position.avgPrice.toFixed(2)}, ${f.factors[2].detail}\n` +
        (s
          ? `     wallet: ${s.wallet_age_days}d old, ${s.markets_traded} markets, ${s.markets_won} won (${(s.win_rate * 100).toFixed(0)}%), lifetime ${usd(s.total_pnl_usd)}${oneShot ? "  ← ONE-SHOT" : ""}`
          : "     wallet: no summary")
    );
  } catch (error) {
    if (error instanceof NansenError && /budget/.test(error.message)) { console.error(error.message); break; }
    console.error(`  ! ${short(f.wallet)} ${(error as Error).message.split("\n")[0]}`);
  }
}

writeFileSync(file, JSON.stringify(run, null, 2));
console.log(`\ncredits spent in total: ${creditsSpent()}\nwritten ${file}`);
