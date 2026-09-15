// Step 1 of the spike: list closed markets with real volume. Costs 1 credit.
//   node --env-file=.env scripts/spike-markets.ts
import { nansen } from "../lib/nansen/client.ts";

interface Market {
  market_id: string;
  question: string;
  event_title: string;
  end_date: string;
  volume: number;
  volume_1mo: number;
  liquidity: number;
  last_trade_price: number;
  unique_traders_24h: number;
  closed: boolean;
}

// usage: spike-markets.ts [tag] [days=45] [n=25]
const tag = process.argv[2];
const days = Number(process.argv[3] ?? 45);
const n = Number(process.argv[4] ?? 25);
const since = new Date(Date.now() - days * 86_400_000).toISOString();

const res = await nansen<{ data: (Market & { tags: string[] })[] }>("prediction-market/market-screener", {
  status: "closed",
  end_date_after: since,
  ...(tag ? { tags: [tag] } : {}),
  order_by: [{ field: "volume_1mo", direction: "DESC" }],
  pagination: { page: 1, per_page: n },
});

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

for (const m of res.data) {
  console.log(
    [
      m.market_id.padEnd(8),
      m.end_date.slice(0, 10),
      usd(m.volume).padStart(13),
      `last ${m.last_trade_price.toFixed(2)}`,
      m.question.slice(0, 70),
      `[${(m.tags ?? []).filter((t) => t !== tag).slice(0, 3).join(", ")}]`,
    ].join("  ")
  );
}
console.log(`\n${res.data.length} closed markets${tag ? ` tagged ${tag}` : ""} ending after ${since.slice(0, 10)}`);
