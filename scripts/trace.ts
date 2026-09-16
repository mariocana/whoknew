// Stage 3: follow the money behind flagged wallets. Per market: pnl-by-market (5) to map
// proxy → owner; per resolved owner: first-funder (1) + related-wallets (1).
//
//   node --env-file=.env scripts/trace.ts --markets 567470,692258 [--min-score 45]
import { readFileSync, writeFileSync } from "node:fs";
import { creditsSpent, nansen, NansenError } from "../lib/nansen/client.ts";
import type { ScreenedMarket } from "./screen.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[++i]);
}
const markets = args.get("markets")?.split(",") ?? [];
const minScore = Number(args.get("min-score") ?? 45);
if (!markets.length) throw new Error("--markets required");

interface PnlRow { address: string; owner_address: string; side_held: string; net_buy_cost_usd: number; total_pnl_usd: number }
interface Funder { first_funder_address: string; first_funder_name: string | null; transaction_hash: string; block_timestamp: string; chain: string }
interface Related { address: string; address_label: string | null; relation: string; block_timestamp: string; chain: string }

export interface Trace {
  owner: string | null;
  pnl: PnlRow | null;
  funder: Funder | null;
  related: Related[];
  tracedAt: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isAddr = (a?: string) => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

const file = "data/screen/latest.json";
const run = JSON.parse(readFileSync(file, "utf8")) as { results: (ScreenedMarket & { traces?: Record<string, Trace> })[] };

for (const id of markets) {
  const r = run.results.find((x) => x.market.market_id === id);
  if (!r) { console.error(`${id}: not in ${file}`); continue; }
  const targets = r.flags.filter((f) => f.score >= minScore);
  if (!targets.length) continue;
  console.log(`\n══ ${r.market.question}`);

  try {
    // One page of 200 covers every wallet that mattered in the market.
    const pnl = await nansen<{ data: PnlRow[] }>("prediction-market/pnl-by-market", {
      market_id: id,
      order_by: [{ field: "total_pnl_usd", direction: "DESC" }],
      pagination: { page: 1, per_page: 200 },
    });
    const byProxy = new Map(pnl.data.map((row) => [row.address.toLowerCase(), row]));
    r.traces ??= {};

    for (const f of targets) {
      const row = byProxy.get(f.wallet.toLowerCase()) ?? null;
      const owner = row && isAddr(row.owner_address) ? row.owner_address : null;
      const trace: Trace = { owner, pnl: row, funder: null, related: [], tracedAt: new Date().toISOString() };

      if (owner) {
        const [funder, related] = await Promise.all([
          nansen<{ data: Funder[] }>("profiler/address/first-funder", { address: owner, chain: "all" }),
          nansen<{ data: Related[] }>("profiler/address/related-wallets", { address: owner, chain: "polygon", pagination: { page: 1, per_page: 20 } }),
        ]);
        trace.funder = funder.data[0] ?? null;
        trace.related = related.data;
      }
      r.traces[f.wallet] = trace;

      const pnlLine = row ? `cost ${usd(row.net_buy_cost_usd)} → pnl ${usd(row.total_pnl_usd)}` : "not in top-200 pnl";
      console.log(`  ${String(f.score).padStart(3)}  ${short(f.wallet)}  ${pnlLine}`);
      if (!owner) { console.log(`       owner: unresolved`); continue; }
      console.log(`       owner: ${owner}`);
      const fu = trace.funder;
      console.log(fu ? `       first funder: ${fu.first_funder_name || short(fu.first_funder_address)} (${fu.chain}) at ${fu.block_timestamp}` : "       first funder: none");
      console.log(trace.related.length
        ? `       related: ${trace.related.slice(0, 8).map((w) => `${short(w.address)}${w.address_label ? ` [${w.address_label}]` : ""} (${w.relation})`).join(", ")}`
        : "       related: none");
    }
  } catch (error) {
    if (error instanceof NansenError && /budget/.test(error.message)) { console.error(error.message); break; }
    console.error(`  ! ${(error as Error).message.split("\n")[0]}`);
  }
}

writeFileSync(file, JSON.stringify(run, null, 2));
console.log(`\ncredits spent in total: ${creditsSpent()}\nwritten ${file}`);
