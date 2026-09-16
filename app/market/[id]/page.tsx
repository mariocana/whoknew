import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { candlesFor, getMarket, loadClusters, tradesFor } from "@/lib/site";
import { Factors, ScoreBadge } from "../../components/Score";
import { Tags, walletTags } from "../../components/WalletTags";
import { PriceChart } from "../../components/PriceChart";
import { day, hoursBetween, leadText, minute, px, short, usd, usdK } from "../../components/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = getMarket(id);
  if (!r) return { title: "Market not found" };
  const f = r.flags[0];
  const description = f
    ? `${usd(f.position.costUsd)} at ${px(f.position.avgPrice)} on ${r.winner}, before the market re-priced from ${px(r.jump!.priceBefore)}. Score ${f.score}.`
    : "Nothing to see — the market already knew.";
  return { title: r.market.question, description, openGraph: { title: r.market.question, description } };
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 19);

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getMarket(id);
  if (!r) notFound();

  const jump = r.jump;
  const newsAt = jump?.newsAt ?? jump?.at;
  const winner = r.winner;

  // Chart window: from a little before the top wallet's first buy (at least 36h before the
  // news) to half a day after, so the minutes that matter are not squeezed into a corner.
  const candles = candlesFor(id).filter((c) => c.side === winner);
  const newsMs = newsAt ? new Date(newsAt + "Z").getTime() : 0;
  const firstBuyMs = r.flags[0] ? new Date(r.flags[0].position.firstBuyAt + "Z").getTime() : newsMs;
  const from = newsAt ? iso(Math.max(Math.min(firstBuyMs - 6 * 3_600_000, newsMs - 36 * 3_600_000), newsMs - 14 * DAY)) : candles[0]?.period_start ?? "";
  const to = newsAt ? iso(newsMs + 12 * 3_600_000) : candles.at(-1)?.period_start ?? "";
  const chartCandles = candles.filter((c) => c.period_start >= from && c.period_start <= to).map((c) => ({ t: c.period_start, close: c.close, volume: c.volume_usd }));

  const top = r.flags[0];
  const twins = loadClusters().twins.filter((t) => t.market_id === id);
  const trades = top ? tradesFor(id) : [];
  const buys = top
    ? trades
        .filter((t) => newsAt && t.timestamp < newsAt)
        .filter((t) => (t.side === winner ? t.buyer : t.seller).toLowerCase() === top.wallet.toLowerCase())
        .map((t) => ({ t: t.timestamp, price: t.side === winner ? t.price : 1 - t.price, usd: t.usdc_value }))
    : [];

  return (
    <article className="space-y-8">
      <header>
        <p className="text-xs text-muted"><Link href="/" className="hover:text-ink">← all markets</Link></p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">{r.market.question}</h1>
            <p className="mt-2 text-sm text-muted">
              {r.market.event_title} · resolved <span className="text-ink-2">{winner}</span> · {day(r.market.end_date)} · {usdK(r.market.volume)} traded ·{" "}
              <a className="underline decoration-line hover:text-ink" href={`https://polymarket.com/market/${r.market.slug}`} target="_blank" rel="noreferrer">polymarket ↗</a>
            </p>
          </div>
          {top && <ScoreBadge score={top.score} size="lg" />}
        </div>
      </header>

      {!jump && (
        <p className="rounded-lg border border-line bg-panel p-5 text-ink-2">
          {r.skipped === "did not resolve cleanly" ? "This market did not settle to a single side, so there is no “before” to examine." : "The market never re-priced sharply upward: the outcome was expected, and there was nothing to know in advance."}
        </p>
      )}

      {jump && newsAt && (
        <>
          <section className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wider text-muted">the market learned</p>
              <p className="mt-1 num text-lg">{minute(newsAt)}</p>
              <p className="text-xs text-muted">price {px(jump.priceBefore)} → {px(jump.priceAfter)} within the hour</p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wider text-muted">positioned before that</p>
              <p className="mt-1 num text-lg">{usd(r.preJumpUsd)}</p>
              <p className="text-xs text-muted">across {r.preJumpWallets} wallets, in the 14 days before{r.tradesComplete ? "" : " (partial)"}</p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-wider text-muted">the top wallet held</p>
              <p className="mt-1 num text-lg">{top ? `${Math.round((top.position.costUsd / Math.max(1, r.preJumpUsd)) * 100)}%` : "—"}</p>
              <p className="text-xs text-muted">of all pre-news money on {winner}</p>
            </div>
          </section>

          {top && chartCandles.length > 1 && (
            <PriceChart candles={chartCandles} buys={buys} newsAt={newsAt} from={from} to={to} walletLabel={short(top.wallet)} winner={winner} />
          )}

          {twins.length > 0 && (
            <section className="rounded-lg border border-series-2/50 bg-panel p-4 text-sm">
              <h2 className="text-xs uppercase tracking-wider text-muted">wallets that moved together here</h2>
              <ul className="mt-2 space-y-1">
                {twins.map((t, i) => (
                  <li key={i} className="text-ink-2">
                    <Link href={`/wallet/${t.wallets[0].wallet}`} className="font-mono text-xs hover:underline">{short(t.wallets[0].wallet)}</Link> and{" "}
                    <Link href={`/wallet/${t.wallets[1].wallet}`} className="font-mono text-xs hover:underline">{short(t.wallets[1].wallet)}</Link> stopped buying{" "}
                    <span className="num text-ink">{t.deltaLastMin} min</span> apart
                    {t.sameFirstSeen ? <> and were both first seen on <span className="text-ink">{t.sameFirstSeen}</span></> : null}
                    {t.strength === "weak" ? " — same half hour, possibly the same headline" : ""}.
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted"><Link href="/clusters" className="hover:text-ink">all pairs →</Link></p>
            </section>
          )}

          <section>
            <h2 className="text-sm uppercase tracking-wider text-muted">who was long {winner} before the news</h2>
            <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-panel">
              {r.flags.filter((f, i) => i < 3 || f.score >= 15).map((f) => {
                const d = r.dossiers?.[f.wallet];
                const t = r.traces?.[f.wallet];
                const s = d?.summary;
                const tags = walletTags({ dossier: d, trace: t, newsAt });
                return (
                  <li key={f.wallet} className="p-4 grid gap-4 sm:grid-cols-[3rem_1fr_1fr]">
                    <ScoreBadge score={f.score} />
                    <div className="space-y-2 text-sm">
                      <p>
                        <Link href={`/wallet/${f.wallet}`} className="font-mono text-xs hover:underline">{f.wallet}</Link>
                      </p>
                      <p className="num">
                        <span className="font-medium">{usd(f.position.costUsd)}</span> at {px(f.position.avgPrice)} · {f.position.trades} buys ·{" "}
                        last one {leadText(hoursBetween(f.position.lastBuyAt, newsAt))} before the news
                      </p>
                      {s ? (
                        <p className="text-xs text-ink-2">
                          first seen {day(s.first_seen)} · {s.markets_traded.toLocaleString("en-US")} markets · {s.markets_won} won ({Math.round(s.win_rate * 100)}%) · lifetime {usd(s.total_pnl_usd)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">not profiled</p>
                      )}
                      {t?.funder && (
                        <p className="text-xs text-ink-2">
                          owner {short(t.owner!)} first funded {minute(t.funder.block_timestamp.replace("Z", ""))} by {t.funder.first_funder_name || short(t.funder.first_funder_address)} on {t.funder.chain}
                        </p>
                      )}
                      <Tags tags={tags} />
                    </div>
                    <Factors flag={f} compact />
                  </li>
                );
              })}
            </ol>
            {r.flags.filter((f, i) => !(i < 3 || f.score >= 15)).length > 0 && (
              <p className="mt-2 text-xs text-muted">{r.flags.filter((f, i) => !(i < 3 || f.score >= 15)).length} smaller positions not shown — none above $500 or scoring 15.</p>
            )}
          </section>
        </>
      )}
    </article>
  );
}
