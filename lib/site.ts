// Where the site reads from. data/site/ is the committed snapshot built by
// scripts/snapshot.ts; when it is absent (local development) fall back to the
// raw cache through lib/store.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import type { Candle, Trade } from "./nansen/pm.ts";
import * as raw from "./store.ts";

const SITE = join(cwd(), "data", "site");
const useSite = existsSync(join(SITE, "screen.json"));

export const source = useSite ? "snapshot" : "raw";
export { rankedMarkets, quietMarkets, getMarket, walletAppearances, loadRun, topScore } from "./store.ts";
export type { MarketRecord, WalletAppearance } from "./store.ts";

const marketCache = new Map<string, { candles: Candle[]; trades: Trade[] }>();

function siteMarket(id: string) {
  if (!marketCache.has(id)) {
    const file = join(SITE, "markets", `${id}.json`);
    marketCache.set(id, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { candles: [], trades: [] });
  }
  return marketCache.get(id)!;
}

export function candlesFor(id: string): Candle[] {
  return useSite ? siteMarket(id).candles : raw.candlesFor(id);
}

export function tradesFor(id: string): Trade[] {
  return useSite ? siteMarket(id).trades : raw.tradesFor(id);
}
