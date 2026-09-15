import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE_URL = "https://api.nansen.ai";
const RAW_DIR = process.env.NANSEN_RAW_DIR ?? "data/raw";
const LEDGER_FILE = process.env.NANSEN_LEDGER ?? "data/credits.json";
const MAX_CREDITS = Number(process.env.NANSEN_MAX_CREDITS ?? 50);

// Credit cost per endpoint, from docs.nansen.ai/getting-started/credits.
// Endpoints missing here are charged at UNKNOWN_COST for budgeting purposes.
const COST: Record<string, number> = {
  "prediction-market/market-screener": 1,
  "prediction-market/event-screener": 1,
  "prediction-market/ohlcv": 1,
  "prediction-market/orderbook": 1,
  "prediction-market/trades-by-market": 1,
  "prediction-market/trades-by-address": 1,
  "prediction-market/pnl-by-address": 1,
  "prediction-market/address-summary": 1,
  "prediction-market/top-holders": 5,
  "prediction-market/pnl-by-market": 5,
  "prediction-market/position-detail": 5,
  "profiler/address/related-wallets": 1,
  "profiler/address/counterparties": 5,
  "profiler/address/labels": 20,
};
const UNKNOWN_COST = 5;

export class NansenError extends Error {
  status?: number;
  body?: unknown;
  constructor(message: string, status?: number, body?: unknown) {
    super(`[nansen] ${message}`);
    this.name = "NansenError";
    this.status = status;
    this.body = body;
  }
}

interface Ledger {
  spent: number;
  calls: Array<{ at: string; endpoint: string; cost: number; cached: boolean }>;
}

function loadLedger(): Ledger {
  if (!existsSync(LEDGER_FILE)) return { spent: 0, calls: [] };
  return JSON.parse(readFileSync(LEDGER_FILE, "utf8")) as Ledger;
}

function saveJson(file: string, value: unknown): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}

export function costOf(endpoint: string): number {
  return COST[endpoint] ?? UNKNOWN_COST;
}

export function creditsSpent(): number {
  return loadLedger().spent;
}

export interface CallOptions {
  /** Skip the disk cache and hit the API. Default false. */
  refresh?: boolean;
}

/**
 * POST to a Nansen endpoint. `endpoint` omits the `/api/v1/` prefix,
 * e.g. "prediction-market/pnl-by-market".
 *
 * Every response is written to data/raw/<endpoint>/<hash>.json and served
 * from there on repeat calls, so a request costs credits at most once.
 * Refuses to call when the ledger would exceed NANSEN_MAX_CREDITS.
 */
export async function nansen<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
  options: CallOptions = {}
): Promise<T> {
  const hash = createHash("sha1").update(canonical(body)).digest("hex").slice(0, 16);
  const file = join(RAW_DIR, endpoint, `${hash}.json`);
  const cost = costOf(endpoint);

  if (!options.refresh && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8")) as { response: T };
    console.error(`[nansen] ${endpoint} — cached (${hash})`);
    return saved.response;
  }

  const key = process.env.NANSEN_API_KEY;
  if (!key) throw new NansenError("NANSEN_API_KEY is not set");

  const ledger = loadLedger();
  if (ledger.spent + cost > MAX_CREDITS) {
    throw new NansenError(
      `budget: ${ledger.spent} spent + ${cost} for ${endpoint} exceeds NANSEN_MAX_CREDITS=${MAX_CREDITS}`
    );
  }

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new NansenError(`${endpoint} → HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, parsed);
  }

  ledger.spent += cost;
  ledger.calls.push({ at: new Date().toISOString(), endpoint, cost, cached: false });
  saveJson(LEDGER_FILE, ledger);
  saveJson(file, { requestedAt: new Date().toISOString(), endpoint, body, response: parsed });

  console.error(
    `[nansen] ${endpoint} — ${cost}cr (${ledger.spent}/${MAX_CREDITS} spent) ${Date.now() - started}ms → ${hash}`
  );
  return parsed as T;
}
