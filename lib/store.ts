// Server-side access to what the scripts produced: data/screen/latest.json and
// the raw Nansen responses in data/raw/. Nothing here calls the API.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import type { Candle, Trade } from "./nansen/pm.ts";
import type { ScreenedMarket } from "../scripts/screen.ts";
import type { Dossier } from "../scripts/profile.ts";
import type { Trace } from "../scripts/trace.ts";

export type MarketRecord = ScreenedMarket & {
  dossiers?: Record<string, Dossier>;
  traces?: Record<string, Trace>;
};

// Paths are anchored to cwd() and statically scoped to data/ so the bundler's
// file tracing does not pull the whole project in.
const SITE_SCREEN = join(cwd(), "data", "site", "screen.json");
const WORK_SCREEN = join(cwd(), "data", "screen", "latest.json");
// The committed snapshot wins when present; otherwise the scripts' working file.
const SCREEN = existsSync(SITE_SCREEN) ? SITE_SCREEN : WORK_SCREEN;
const RAW = join(cwd(), "data", "raw");

let cache: { mtime: number; run: { ranAt: string; results: MarketRecord[] } } | null = null;

/** The scripts' working file, regardless of whether a site snapshot exists. */
export function loadWorkRun(): { ranAt: string; results: MarketRecord[] } {
  if (!existsSync(WORK_SCREEN)) throw new Error(`${WORK_SCREEN} is missing — run the screener first`);
  return JSON.parse(readFileSync(WORK_SCREEN, "utf8"));
}

export function loadRun() {
  const stat = existsSync(SCREEN) ? readFileSync(SCREEN, "utf8") : null;
  if (!stat) return { ranAt: "", results: [] as MarketRecord[] };
  const mtime = stat.length; // cheap change detector: the file only ever grows or is rewritten
  if (!cache || cache.mtime !== mtime) cache = { mtime, run: JSON.parse(stat) };
  return cache.run;
}

export function topScore(r: MarketRecord): number {
  return r.flags[0]?.score ?? 0;
}

export function rankedMarkets(): MarketRecord[] {
  return loadRun()
    .results.filter((r) => r.jump && r.flags.length)
    .sort((a, b) => topScore(b) - topScore(a) || b.market.volume - a.market.volume);
}

export function quietMarkets(): MarketRecord[] {
  return loadRun().results.filter((r) => !r.jump || !r.flags.length);
}

export function getMarket(id: string): MarketRecord | undefined {
  return loadRun().results.find((r) => r.market.market_id === id);
}

export interface WalletAppearance {
  market: MarketRecord;
  flag: MarketRecord["flags"][number];
}

export function walletAppearances(address: string): WalletAppearance[] {
  const a = address.toLowerCase();
  const out: WalletAppearance[] = [];
  for (const r of loadRun().results) {
    for (const f of r.flags) if (f.wallet.toLowerCase() === a) out.push({ market: r, flag: f });
  }
  return out.sort((x, y) => y.flag.score - x.flag.score);
}

// --- raw cache -------------------------------------------------------------

type RawFile<T> = { body: Record<string, unknown>; response: { data: T[] } };
let rawIndex: Map<string, string[]> | null = null; // "<endpoint>|<market_id>" → files

function indexRaw(): Map<string, string[]> {
  if (rawIndex) return rawIndex;
  rawIndex = new Map();
  for (const endpoint of ["prediction-market/ohlcv", "prediction-market/trades-by-market"]) {
    // The raw cache is a development-only fallback and never part of a deploy.
    const dir = join(/*turbopackIgnore: true*/ RAW, endpoint);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(/*turbopackIgnore: true*/ dir)) {
      const file = join(/*turbopackIgnore: true*/ dir, f);
      // Only the head is needed for the market id; bodies are small and come first.
      const head = readFileSync(file, "utf8").slice(0, 600);
      const m = /"market_id":\s*"(\d+)"/.exec(head);
      if (!m) continue;
      const key = `${endpoint}|${m[1]}`;
      rawIndex.set(key, [...(rawIndex.get(key) ?? []), file]);
    }
  }
  return rawIndex;
}

function rawFor<T>(endpoint: string, marketId: string): T[] {
  const files = indexRaw().get(`${endpoint}|${marketId}`) ?? [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as RawFile<T>;
    for (const row of parsed.response.data) {
      const k = JSON.stringify(row);
      if (!seen.has(k)) { seen.add(k); out.push(row); }
    }
  }
  return out;
}

export function candlesFor(marketId: string): Candle[] {
  return rawFor<Candle>("prediction-market/ohlcv", marketId).sort((a, b) => a.period_start.localeCompare(b.period_start));
}

export function tradesFor(marketId: string): Trade[] {
  return rawFor<Trade>("prediction-market/trades-by-market", marketId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
