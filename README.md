# Who Knew?

A scanner for Polymarket that looks for **unusual conviction before the news** — wallets that took size on an
outcome while the market still priced it as unlikely, shortly before it re-priced. Built on Nansen's
prediction-market and profiler data for the Meridian Buildathon.

It does not find insiders; nobody can from on-chain data alone. It finds bets that have the *shape* of
information, and shows every number behind the score.

## Pipeline

```
market-screener ─▶ ohlcv ─▶ trades-by-market ─▶ net positions ─▶ score ─▶ address-summary / pnl-by-address
   discovery      news hour   only before the news   per wallet     0–100     dossier on flagged wallets
   1 cr / tag     1 cr         1 cr / 1000 trades                              2 cr / wallet
```

- **News hour** — the hourly candle where the winning side jumped ≥ 0.25 with real volume, and stayed there.
- **Positions** — net long exposure to the winner from trades before that hour. Buying the winner and
  selling the loser are the same bet. Mints are invisible in the trade feed, so sizes are a floor.
- **Score** — `size × (0.40·odds + 0.35·timing + 0.25·share)`. Size gates: a $100 bet cannot score high
  however well-timed. Factors are stored with the flag.
- **Skipped on purpose** — sports and other live-event markets (in-play trading looks exactly like
  foreknowledge), recurring post-count markets, markets the crowd already priced above 0.6.

## Running

```bash
cp .env.example .env            # NANSEN_API_KEY, NANSEN_MAX_CREDITS
npm run screen -- --dry-run     # list candidates, estimate credits, spend only discovery
npm run screen                  # score them → data/screen/latest.json
npm run profile                 # dossiers for flags ≥ 30
```

Every API response is cached in `data/raw/` and the ledger in `data/credits.json`; a request is paid at
most once, and the client refuses to exceed `NANSEN_MAX_CREDITS`.

Findings from the exploratory spikes are in [NOTES.md](NOTES.md).
