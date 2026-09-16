# Who Knew?

**Who was positioned before the market knew?**

A scanner over Polymarket that finds bets with the shape of information: money placed on an outcome while
the market still called it unlikely, hours or minutes before the price moved. Built on Nansen's
prediction-market and profiler data for the Meridian Buildathon.

It finds shapes, not people. Nobody can prove intent from on-chain data, so nothing here is an accusation.
Every score is decomposed into the four numbers that produced it, and every number links back to the raw
Nansen response it came from.

## One case, at the minute

*Will María Corina Machado win the Nobel Peace Prize in 2025?* — 9 October 2025, UTC.

```
22:13   a wallet on Ethereum receives the first gas of its life
22:42   its Polymarket proxy starts buying YES at ~20¢ — 33 buys in 17 minutes, $16.9k
        (94% of every dollar anyone put on YES before the news)
22:59   last buy
23:00   the market re-prices from 30¢ to 74¢: the leak reaches Polymarket
09:00   the Norwegian Nobel Committee announces the laureate — ten hours later
```

Total cost including minted shares: $43k. Profit: +$71.6k. The wallet has traded eight markets in its life,
all of them Nobel candidates; it also put $13.5k on Yulia Navalnaya and lost it.

The next day [Bloomberg](https://www.bloomberg.com/news/articles/2025-10-10/unusual-bets-on-nobel-peace-prize-winner-prompt-probe-into-leaks)
and [CoinDesk](https://www.coindesk.com/markets/2025/10/11/norwegian-officials-probe-major-polymarket-bets-on-nobel-peace-winner)
reported that Norwegian authorities were investigating last-hour Polymarket bets on Machado by freshly
created accounts; the Nobel Institute said it might have been "the victim of a criminal actor", and in
February 2026 concluded a cyberattack was the most likely source of the leak. The scanner found this
wallet on its own, from 1,000 markets, with no hint.

Scored **85 / 100**: size 100 · odds 66 · timing 100 · share 94.

## What else it found

Screening the 1,000 largest resolved markets since mid-2024 — 353 settled YES, 672 NO — for
~2,900 Nansen credits, about $3. A NO can be a surprise too: a ceasefire market collapsing when talks fail
is measured the same way.

| | position | before the news | the wallet |
|---|---|---|---|
| **Thailand strikes Cambodia by Friday?** | $99k at 41¢ | 12 min | the **only market it ever traded**, in 416 days; owner first funded by `tsipouro.eth` |
| **US military action against Iran by Sunday?** | $139k at 23¢ — 71% of all pre-news money | 5 h | 110 markets, 22% win rate, −$219k lifetime; made **+$781k** that night, +$368k more on the Saturday market |
| **Israel military action against Iran by Friday?** | $34k at 22¢ | 6 h | owner funded on Polygon **two days before** the strikes; then bet on the US market too |
| **MicroStrategy sells any Bitcoin by June 30?** | $2.9k at **2¢** | 9.5 h | only market ever traded |
| **Will Trump meet with Zelenskyy by December 31?** | $19k + $11k | 6.8 h, both | two wallets, **both 264 days old, both stopped buying the same minute** |

And the ones that look alarming until you read the dossier — which is the point of having one:
*Houthis agree to end attacks* ($11k, 18 minutes ahead) belongs to a wallet with 995 markets and +$2.5M
lifetime — a professional reacting fast. *Egg prices above $6* ($17.7k, eleven days ahead) is a forecaster
with a 72% win rate over 408 markets. Speed and skill are not information; the factors keep them apart.

Of 1,035 markets examined, 286 had someone positioned before a surprise, 31 score 50 or more, 3 score 70 or
more. The other 749 had nothing to see: the market already expected the outcome, or nobody was there early.
That base rate is part of the result.

## Wallets that move together

One wallet is a bet; two wallets created the same day that stop buying the same minute are a person.
`/clusters` lists pairs whose buying starts and stops together — counted only when both were *takers* and
never shared a fill, because one order sweeping five resting makers makes five wallets look coordinated
when they were merely hit — plus wallets flagged across several markets, and owners with a common first
funder. The Trump–Zelenskyy pair above is the first entry.

## How it works

```
market-screener ─▶ ohlcv ─▶ trades-by-market ─▶ net positions ─▶ score ─▶ address-summary ─▶ pnl-by-market ─▶ first-funder
   discovery      news hour     the minute       per wallet       0–100      who it is        proxy → owner    where the money
                                                                                                                came from
```

1. **Discovery.** Closed markets by tag and 90-day window. Drop sports and other live events (in-play
   trading looks exactly like foreknowledge), recurring count-the-posts markets, and any question settled
   by a number nobody holds in advance. Which side won is read from the candles, not the screener.
2. **The hour the market learned.** From hourly candles: the winning side jumps ≥ 25¢ on real volume and
   stays there. Skip if the market already priced the outcome above 60¢ — there was nothing to know.
3. **The minute.** Inside the trades before that hour, the first trade of the final run-up. Everything
   after it is a reaction, however fast.
4. **Positions.** Net exposure to the winner per wallet, from trades in the 14 days before that minute.
   Buying YES and selling NO are the same bet; both roles count. Mints are invisible in the trade feed, so
   sizes are floors.
5. **Score.** `size × (0.40·odds + 0.35·timing + 0.25·share)`. Size gates: a $100 bet cannot score high
   however well-timed. Odds is how cheap they bought; timing is how close the last buy landed; share is
   their fraction of all pre-news money on the winner.
6. **Dossier.** For flagged wallets: age *at the time of the bet*, markets traded, win rate, lifetime PnL.
   Then `pnl-by-market` to resolve the SAFE proxy to its owner, and on the owner `first-funder` and
   `related-wallets`.

## Why this needs Nansen

Polymarket positions live in SAFE proxy wallets on Polygon. Nansen's prediction-market endpoints decode the
trades, resolve proxies to owners, and compute per-wallet PnL and history; the profiler answers who funded
the owner and when, and which wallets move with it. Step 6 is what turns "someone bought early" into "a
wallet created 47 minutes earlier bought early" — and that is the finding. No other single source gives
both halves.

## Limits, stated

- **Owner resolution covers about half the flagged wallets.** Where it exists, the funding trail is the
  strongest signal in the system. Where it does not, the page says so; age, history and timing still stand.
- **Sizes are floors.** Shares acquired by splitting collateral never appear in the trade feed. Cost basis
  from `pnl-by-market` is complete; timing from trades is not.
- **Hourly candles are coarse.** The minute-level news moment is inferred from trades and is only as good
  as the order flow around it.
- **A score describes a bet, not a person.** Veterans with strong theses, fast reactors, and market makers
  all take early positions. The dossier exists to tell them apart, and sometimes it cannot.

## The site

```
/                     ranked feed — score, market, the top wallet's position and what Nansen says about it
/market/<id>          the minute the market learned; who was long before it; the top wallet's buys on the price chart
/wallet/<address>     dossier — age at the time of the bet, history, where the owner's first funds came from
/clusters             wallets that move together
/quiet                the markets with nothing to see, and why
```

The site makes no API calls. It reads `data/site/`, a 23 MB snapshot committed to the repo.

## Running it

```bash
nvm use                          # Node 22.18+
npm install
cp .env.example .env             # NANSEN_API_KEY, NANSEN_MAX_CREDITS

npm run screen -- --from 2022-11-01 --to 2026-09-15 --window 90 --max 1000 --dry-run   # list, estimate, spend only discovery
npm run screen -- --from 2022-11-01 --to 2026-09-15 --window 90 --max 1000             # score → data/screen/latest.json
npm run profile -- --min-score 40 --max-wallets 30                                     # dossiers, 2 credits each
npm run trace -- --markets 560868,567470                                               # proxy → owner → funding
npm run snapshot && npm run clusters                                                   # → data/site/ for the site
npm run dev
```

Every Nansen response is cached in `data/raw/` and every charged call is written to `data/credits.json`;
a request is paid at most once and the client refuses to exceed `NANSEN_MAX_CREDITS`. The whole project
so far cost 3,199 credits.

Deploys anywhere Next.js runs; `railway.toml` is included. No environment variables are needed in
production — never put the API key on the server.

Findings from every exploratory step, including the dead ends, are in [NOTES.md](NOTES.md).

## Licence

MIT
