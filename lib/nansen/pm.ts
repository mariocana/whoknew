// Typed wrappers over the Polymarket ("prediction-market") endpoints we use.
import { nansen } from "./client.ts";

export interface Market {
  market_id: string;
  question: string;
  slug: string;
  event_id: string;
  event_title: string;
  closed: boolean;
  end_date: string;
  tags: string[];
  volume: number;
  liquidity: number;
  last_trade_price: number;
  created_at: string;
}

export interface Candle {
  side: string;
  outcome_index: number;
  period_start: string; // hourly, ISO without zone
  open: number;
  high: number;
  low: number;
  close: number;
  volume_usd: number;
  trade_count: number;
  unique_traders: number;
}

export interface Trade {
  timestamp: string;
  seller: string;
  buyer: string;
  taker_action: "buy" | "sell";
  side: string;
  outcome_index: number;
  size: number;
  price: number;
  usdc_value: number;
  tx_hash: string;
}

export interface AddressSummary {
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

interface Page<T> {
  data: T[];
  pagination: { page: number; per_page: number; is_last_page: boolean };
}

export async function listClosedMarkets(opts: {
  tag?: string;
  endedAfter: string;
  perPage?: number;
}): Promise<Market[]> {
  const res = await nansen<Page<Market>>("prediction-market/market-screener", {
    status: "closed",
    end_date_after: opts.endedAfter,
    ...(opts.tag ? { tags: [opts.tag] } : {}),
    order_by: [{ field: "volume_1mo", direction: "DESC" }],
    pagination: { page: 1, per_page: opts.perPage ?? 50 },
  });
  return res.data;
}

export async function getCandles(marketId: string): Promise<Candle[]> {
  const res = await nansen<Page<Candle>>("prediction-market/ohlcv", {
    market_id: marketId,
    order_by: [{ field: "period_start", direction: "ASC" }],
    pagination: { page: 1, per_page: 1000 },
  });
  return res.data;
}

/**
 * Trades in time order, one credit per 1000. Stops paging as soon as a page
 * ends past `until`, so a market's post-news flood is never paid for.
 */
export async function getTradesUntil(
  marketId: string,
  until: string,
  maxPages = 4
): Promise<{ trades: Trade[]; complete: boolean; pages: number }> {
  const trades: Trade[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await nansen<Page<Trade>>("prediction-market/trades-by-market", {
      market_id: marketId,
      order_by: [{ field: "timestamp", direction: "ASC" }],
      pagination: { page, per_page: 1000 },
    });
    trades.push(...res.data);
    const last = res.data.at(-1);
    if (res.pagination.is_last_page || !last || last.timestamp >= until) {
      return { trades, complete: true, pages: page };
    }
  }
  return { trades, complete: false, pages: maxPages };
}

export async function getAddressSummary(proxy: string): Promise<AddressSummary | null> {
  const res = await nansen<Page<AddressSummary>>("prediction-market/address-summary", { address: proxy });
  return res.data[0] ?? null;
}
