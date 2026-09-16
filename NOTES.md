# Spike notes — Nansen prediction-market data

Findings from the first 38 credits, 2026-09-15. Market 4511449, *Guangzhou: Elias Ymer vs Semen Pankin*.

## Data mechanics

- **Proxies.** Polymarket positions sit in SAFE proxy wallets. `pnl-by-market` returns `address` (proxy)
  and `owner_address` (EOA), but the owner resolved in only 7 of 25 rows; unresolved rows carry `"0x"`.
  - prediction-market endpoints (`address-summary`, `pnl-by-address`, `trades-by-*`) key on the **proxy**.
  - profiler endpoints (`first-funder`, `related-wallets`) are only meaningful on the **owner**. On a proxy,
    first-funder returns nothing and related-wallets returns the Polymarket factory (`Deployed by` / `Created by`).
  - So the funding-trail signals exist for roughly a third of wallets. The rest still have age, history,
    win rate, timing and size.
- **Sort is not honoured.** `pnl-by-market` with `order_by total_pnl_usd DESC` came back ordered by |pnl|;
  winners and losers interleaved. Filter client-side.
- **"Both" = market maker.** Half of the large positions hold both outcomes. Exclude before measuring concentration.
- **Selling one outcome is buying the other.** Compute net exposure per outcome from both `buyer` and `seller` roles.
- **Trades miss mints/merges.** `trades-by-market` decodes `OrderFilled` only; shares acquired by splitting
  collateral do not appear. Use `pnl-by-market` / `position-detail` for cost basis, trades for timing.
- **Paging.** 1,000 trades per page, 1 credit per page; this market had 3,136 trades.
- **Latency.** `address-summary` took 20s once and 504'd behind Cloudflare; retry with backoff.
- **Costs.** `first-funder` is not in the published cost table; budgeted at 5 until the dashboard says otherwise.

## What the market showed

- Price path (hourly): Pankin 0.31 → 0.74 → 0.00. Ymer 0.69 → 0.26 → 1.00. This is in-play betting.
- Pre-match: 39 trades, $2.2k. In-play: 3,097 trades, $351k.
- Biggest PnL winner (`0xdd7e…`) never bought Ymer: sold 26k Pankin shares at 0.62 at the in-play peak.
  497 days old, 273 markets, lifetime −$40k. A regular sports bettor, not an informed one.
- Second largest holder: 62k markets, +$2.9M lifetime, holds both sides — a market maker.

## Implication

Sports markets on Polymarket are in-play markets; there is no pre-event window in which "knowing" would show.
The pre-resolution signal the project is built on belongs to markets without a live phase — politics,
announcements, appointments, crypto events. Next spike targets those.

## Funnel that keeps credits low

1. `ohlcv` (1) — pre-event vs post-news volume share, biggest hourly move.
2. `trades-by-market` (1/page) — who took size early, at what price, net per outcome.
3. Only for flagged wallets: `address-summary` (1) on the proxy; `first-funder`, `related-wallets` on the owner when resolved.

## Second market: 1807950, *Kristi Noem divorce by August 31?* (3 credits)

- Politics markets are found with `tags: ["Politics"]`; tag values are Polymarket's own free-form ones
  (`Politics`, `Sports`, `Tennis`, `Tweet Markets`, `Geopolitics`, …), not documented by Nansen.
- Two news moments: 2026-07-10 15:00 (0.05 → 0.79, $2.1k in the hour) and 2026-08-31 18:00 (0.23 → 0.99).
  Between them the price sank back to 0.07. The $21k at 0.99 on 08-31 22:00 is resolution arbitrage.
- Largest net-long YES position before the July jump: $315. Nothing before the August jump.
- Trades sum to $22k of the screener's $38k volume — mints/merges again.

## Takeaways after 41 credits

- The mechanics hold: OHLCV locates the news hour; trades give who was positioned before it and at what
  price; net exposure per outcome handles both trade roles. Scoring a market costs 2–4 credits.
- The signal is rare. Two markets, zero hits. The product is a scanner over hundreds of markets that surfaces
  the few anomalous ones with evidence, not a per-market feature.
- Decisive experiment: ~200 closed news/politics/geopolitics/crypto markets, ~500 credits. Count the hits.

## Screener v1 over 37 hand-picked markets (44 + 4 credits; 82 total)

- `first-funder` costs **1 credit** (dashboard: 100 − 72 after 28 charged calls); ledger synced.
- Discovery across Politics, Geopolitics, World, Crypto, Business, Science for 90 days: 349 markets,
  138 ≥ $5k and not live/recurring, of which only **48 resolved YES**. NO-by-expiry markets never jump and
  wasted 24 OHLCV credits before the `--resolved yes` filter existed.
- 8 markets had a surprise ≥ 0.4. Top flags, profiled:
  - Syrskyi out by July 31 — `0x3a23…0f72`, $5.3k at 0.45 over 61 trades across two days, last buy at 10:59
    with the news landing in the 11:00 candle. Wallet: 319d, 976 markets, 36% win rate, +$30k lifetime.
    The right *shape* (steady accumulation at a flat price right before the news), but a veteran, not a fresh wallet.
  - US strike Somalia — `0xf9b7…60a4`, $2.3k, 1088d, 1847 markets. Veteran.
- Hourly candles are coarse; `newsMoment` now finds the first trade of the final run-up so leads are measured
  in minutes. For the top cases the price genuinely did not move before the candle.
- Zero cases matching the full pattern (size + before + low odds + fresh wallet) in 37 markets.

## Options

A. Widen the window to Polymarket's full history (Nov 2022 →) with dated screener windows; ~2 credits per YES market.
B. Reframe as "how the market learned": per-market anatomy of the news moment, with the rare clean cases on top.

## Historical screen: top 1,000 YES markets by volume, Nov 2022 → Sep 2026 (2,914 + 56 credits; 3,148 total)

Full-history discovery (16 × 90-day windows × 6 tags, per_page 500): 19,637 closed markets, 5,852 YES ≥ $5k
non-noise, 4,497 after dropping numeric questions (prices, counts, thresholds). Screened the 1,000 largest at
~2.9 credits each. 283 had a surprise ≥ 0.4. Top 30 flags profiled.

Strong cases (score, position, lead, wallet):
- **Machado Nobel Peace Prize 2025** — 85 — `0xa430…91ca` $16.9k at 0.20, minutes before; 8 markets lifetime.
  Matches the case reported by Norwegian press in Oct 2025.
- **US/Israel strikes on Iran, June 2025** — a cluster of wallets 4–11h ahead:
  `0x1f1d…63d9` $21k at 0.08 + $139k at 0.23 (110 markets, 22% win, −$219k lifetime);
  `0x0afc…30b2` $7k + $23.6k on both the US and Israel markets (7 markets, 6 won);
  `0x909f…a8c3` $9k at 0.14, 11h ahead (75 markets, 92% win); plus `0xb1fa`, `0x5afd`, `0xfe6e`, `0x53af`.
- **Thailand strikes Cambodia** — 64 — `0xb9c3…8763` $99k at 0.41, 12 min ahead; **the only market this wallet ever traded** (416d old).
- **MicroStrategy sells any Bitcoin** — 58 — `0x0377…12d7` $2.9k at 0.02, 9.5h ahead; only market ever traded.
- **Trump–Zelenskyy meeting** — `0x1b60…a55b` and `0x93b6…fb54`: both 264 days old, both last bought 6.8h ahead. Likely one person.

Recognisable false positives (the factors separate them): Houthis (`0xbaa2`, 995 markets, +$2.5M, 0.3h — a pro
reacting), egg prices (veteran forecaster, 11 days ahead), Iran airspace (910-market veteran, −$5.4M).

Verdict: ~10 strong cases per 1,000 markets. The original framing holds; the "how the market learned" page is
the right shell for the other 990.

Next: `pnl-by-market` on the key markets to recover `owner_address`, then first-funder / related-wallets on
resolved owners — especially the two one-shot wallets.

## Money trail on the key markets (51 credits; 3,199 total)

`scripts/trace.ts`: `pnl-by-market` (200 rows) maps proxy → owner; `first-funder` + `related-wallets` on
resolved owners. Owner resolved for roughly half the flagged wallets.

- **Machado Nobel** — owner `0xe206…4043` first funded 2025-10-09 **22:13 UTC**; proxy bought $16.9k at 0.20
  between 22:42 and 22:59 (94% of pre-news money); market jumped 0.30 → 0.74 at 23:00; official announcement
  10 Oct 09:00 UTC. Total cost $43k (mints included) → +$71.6k. Every factor present.
- **Thailand strikes Cambodia** — owner `0xf474…5fd7` first funded Jan 2025 by `tsipouro.eth`, related `y33ter.eth`.
  One-shot wallet, $99k over 201 buys in the 10h before the jump → +$142k.
- **Iran, June 2025** — `0x0afc…30b2` owner `0xfa6a…ee66` funded on Polygon 2025-06-11 19:04, two days before the
  Israeli strikes; $34k on the Israel market (+$129k) and $7k on the US one. `0x1f1d…63d9`: $270k → +$781k
  (Sunday) and $35k → +$368k (Saturday); owner unresolved.
- MicroStrategy one-shot and the twin Trump–Zelenskyy wallets: owner unresolved.

Limit to state in the UI: the funding trail exists only where Nansen resolves the SAFE proxy to its owner
(~half of cases). Age, history and timing are available for all.
