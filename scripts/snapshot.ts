// Build data/site/: everything the site needs and nothing else, small enough to commit.
//
//   node scripts/snapshot.ts
//
// From data/screen/latest.json and the 1 GB raw cache, keeps for each market with a
// surprise: the winning side's hourly candles in the chart window and the trades of
// the wallets the site shows. No API calls.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { candlesFor, loadRun, tradesFor, type MarketRecord } from "../lib/store.ts";

const OUT = "data/site";

// The snapshot is built locally from the raw cache and committed. On a server there is no
// cache, and rebuilding would wipe the committed site data.
if (!existsSync("data/raw/prediction-market/ohlcv")) {
  console.error("data/raw/ is not here — refusing to rebuild data/site/ from nothing. Run this locally and commit the result.");
  process.exit(1);
}
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 19);

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(`${OUT}/markets`, { recursive: true });

const run = loadRun();
let bytes = 0, kept = 0;

for (const r of run.results as MarketRecord[]) {
  if (!r.jump || !r.flags.length) continue;
  const newsAt = r.jump.newsAt ?? r.jump.at;
  const newsMs = new Date(newsAt + "Z").getTime();
  const from = iso(newsMs - 15 * DAY), to = iso(newsMs + 2 * DAY);
  const shown = new Set(r.flags.map((f) => f.wallet.toLowerCase()));

  const candles = candlesFor(r.market.market_id)
    .filter((c) => c.side === r.winner && c.period_start >= from && c.period_start <= to)
    .map(({ side, period_start, close, volume_usd }) => ({ side, period_start, close, volume_usd }));
  const trades = tradesFor(r.market.market_id)
    .filter((t) => t.timestamp < newsAt && (shown.has(t.buyer.toLowerCase()) || shown.has(t.seller.toLowerCase())))
    .map(({ timestamp, buyer, seller, side, price, usdc_value }) => ({ timestamp, buyer, seller, side, price, usdc_value }));

  const file = `${OUT}/markets/${r.market.market_id}.json`;
  writeFileSync(file, JSON.stringify({ candles, trades }));
  bytes += statSync(file).size;
  kept++;
}

// The screen file itself, minus nothing: dossiers and traces live in it.
writeFileSync(`${OUT}/screen.json`, JSON.stringify(run));
bytes += statSync(`${OUT}/screen.json`).size;

console.log(`${kept} markets → ${OUT}/ (${(bytes / 1_048_576).toFixed(1)} MB)`);
