// Step 2 of the spike: who won a market, and who are they? ~17 credits for 3 wallets.
//   node --env-file=.env scripts/spike-market.ts <market_id> [wallets=3]
import { nansen } from "../lib/nansen/client.ts";

const marketId = process.argv[2];
const topN = Number(process.argv[3] ?? 3);
if (!marketId) throw new Error("usage: spike-market.ts <market_id> [wallets]");

interface PnlRow {
  address: string;
  owner_address: string;
  side_held: string;
  net_buy_cost_usd: number;
  net_sell_proceeds_usd: number;
  redemption_value_usd: number;
  unrealized_value_usd: number;
  total_pnl_usd: number;
  question: string;
  market_resolved: boolean;
}
interface Summary {
  address: string;
  first_seen: string;
  wallet_age_days: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  total_pnl_usd: number;
  markets_won: number;
  markets_traded: number;
  win_rate: number;
}
interface Funder {
  wallet_address: string;
  first_funder_address: string;
  first_funder_name: string | null;
  transaction_hash: string;
  block_timestamp: string;
  chain: string;
}
interface Related {
  address: string;
  address_label: string | null;
  relation: string;
  block_timestamp: string;
  chain: string;
}
interface AddrPnl {
  market_id: string;
  question: string;
  side_held: string;
  net_buy_cost_usd: number;
  total_pnl_usd: number;
  market_resolved: boolean;
}

// Nansen resolves SAFE proxies to owners only sometimes; "0x" means it could not.
const ownerOf = (r: PnlRow) => (r.owner_address && r.owner_address.length === 42 ? r.owner_address : r.address);

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const pnl = await nansen<{ data: PnlRow[] }>("prediction-market/pnl-by-market", {
  market_id: marketId,
  order_by: [{ field: "total_pnl_usd", direction: "DESC" }],
  pagination: { page: 1, per_page: 25 },
});

const rows = pnl.data;
console.log(`\n${rows[0]?.question ?? marketId}\n`);
console.log("top 25 by PnL:");
const totalWon = rows.filter((r) => r.total_pnl_usd > 0).reduce((s, r) => s + r.total_pnl_usd, 0);
for (const r of rows) {
  console.log(
    `  ${short(ownerOf(r)).padEnd(12)} ${r.side_held.padEnd(4)} cost ${usd(r.net_buy_cost_usd).padStart(9)}  pnl ${usd(r.total_pnl_usd).padStart(9)}  ${((r.total_pnl_usd / totalWon) * 100).toFixed(0)}% of top-25 winnings`
  );
}

for (const r of rows.slice(0, topN)) {
  const owner = ownerOf(r);
  console.log(`\n══ ${owner}${owner !== r.address ? `  (proxy ${short(r.address)})` : "  (proxy, owner unresolved)"}`);
  console.log(`   bet ${usd(r.net_buy_cost_usd)} on ${r.side_held} → pnl ${usd(r.total_pnl_usd)}`);

  const [summary, funder, related, history] = await Promise.all([
    nansen<{ data: Summary[] }>("prediction-market/address-summary", { address: owner }),
    nansen<{ data: Funder[] }>("profiler/address/first-funder", { address: owner, chain: "all" }),
    nansen<{ data: Related[] }>("profiler/address/related-wallets", {
      address: owner,
      chain: "polygon",
      pagination: { page: 1, per_page: 10 },
    }),
    nansen<{ data: AddrPnl[] }>("prediction-market/pnl-by-address", {
      address: owner,
      order_by: [{ field: "total_pnl_usd", direction: "DESC" }],
      pagination: { page: 1, per_page: 10 },
    }),
  ]);

  const s = summary.data[0];
  if (s) {
    console.log(
      `   polymarket: first seen ${s.first_seen?.slice(0, 10)}, ${s.wallet_age_days}d old, ${s.markets_traded} markets traded, ${s.markets_won} won (${(s.win_rate * 100).toFixed(0)}%), lifetime pnl ${usd(s.total_pnl_usd)}`
    );
  } else {
    console.log("   polymarket: no summary");
  }

  const f = funder.data[0];
  console.log(
    f
      ? `   first funder: ${f.first_funder_name ?? short(f.first_funder_address)} on ${f.chain} at ${f.block_timestamp}`
      : "   first funder: none"
  );

  console.log(
    related.data.length
      ? `   related: ${related.data.map((w) => `${short(w.address)}${w.address_label ? ` [${w.address_label}]` : ""} (${w.relation})`).join(", ")}`
      : "   related: none"
  );

  console.log(`   other markets (top ${history.data.length} by pnl):`);
  for (const h of history.data) {
    console.log(`     ${usd(h.total_pnl_usd).padStart(9)}  ${h.side_held.padEnd(4)} cost ${usd(h.net_buy_cost_usd).padStart(8)}  ${h.question.slice(0, 60)}`);
  }
}
