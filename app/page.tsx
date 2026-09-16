import Link from "next/link";
import { rankedMarkets, quietMarkets, loadRun, type MarketRecord } from "@/lib/site";
import { ScoreBadge } from "./components/Score";
import { Tags, walletTags } from "./components/WalletTags";
import { day, hoursBetween, leadText, px, short, usd, usdK } from "./components/format";

export const dynamic = "force-dynamic";

function Row({ r }: { r: MarketRecord }) {
  const f = r.flags[0];
  const p = f.position;
  const newsAt = r.jump!.newsAt ?? r.jump!.at;
  const tags = walletTags({ dossier: r.dossiers?.[f.wallet], trace: r.traces?.[f.wallet], newsAt: r.jump?.newsAt ?? r.jump?.at });
  return (
    <li className="border-t border-line first:border-t-0">
      <Link href={`/market/${r.market.market_id}`} className="grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_16rem] gap-x-4 gap-y-2 py-4 hover:bg-panel/60 -mx-3 px-3 rounded-md">
        <ScoreBadge score={f.score} />
        <div className="min-w-0">
          <h3 className="font-medium leading-snug">{r.market.question}</h3>
          <p className="mt-1 text-xs text-muted">
            {day(r.market.end_date)} · {usdK(r.market.volume)} traded · the market was at{" "}
            <span className="num text-ink-2">{px(r.jump!.priceBefore)}</span> before it learned
          </p>
          <div className="mt-2"><Tags tags={tags} /></div>
        </div>
        <div className="col-start-2 sm:col-start-3 text-sm">
          <p>
            <span className="font-mono text-xs text-muted">{short(f.wallet)}</span>
          </p>
          <p className="num">
            <span className="font-medium">{usd(p.costUsd)}</span> at {px(p.avgPrice)}
          </p>
          <p className="text-xs text-ink-2">{leadText(hoursBetween(p.lastBuyAt, newsAt))} before the news · {p.trades} buys</p>
        </div>
      </Link>
    </li>
  );
}

export default function Home() {
  const run = loadRun();
  const ranked = rankedMarkets();
  const quiet = quietMarkets();
  const strong = ranked.filter((r) => r.flags[0].score >= 50);

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Who was positioned before the market knew?</h1>
        <p className="mt-3 text-ink-2 leading-relaxed">
          For every resolved Polymarket market where the outcome came as a surprise, this page finds the minute the price
          moved, reconstructs who held the winning side before that minute, and scores each position on four things:
          how much money, how unlikely the market thought it was, how close to the news, and how much of everyone&rsquo;s
          pre-news conviction was theirs. Then it asks Nansen who the wallet is — age, history, and where its first
          funds came from.
        </p>
        <p className="mt-3 text-sm text-muted">
          {run.results.length.toLocaleString("en-US")} markets screened · {ranked.length} had someone positioned before a surprise ·{" "}
          {strong.length} score 50 or more · <Link href="/quiet" className="underline decoration-line hover:text-ink">{quiet.length} had nothing to see</Link>.
          Nothing here is an accusation; the numbers are the whole claim.
        </p>
        <p className="mt-2 text-sm text-muted">
          Also: <Link href="/watch" className="underline decoration-line hover:text-ink">conviction building now</Link> ·{" "}
          <Link href="/clusters" className="underline decoration-line hover:text-ink">wallets that move together</Link>.
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm uppercase tracking-wider text-muted">ranked by score</h2>
          <span className="text-xs text-muted">score · market · the top wallet&rsquo;s position</span>
        </div>
        <ul className="mt-3">
          {ranked.slice(0, 60).map((r) => <Row key={r.market.market_id} r={r} />)}
        </ul>
        {ranked.length > 60 && <p className="mt-4 text-xs text-muted">{ranked.length - 60} more with lower scores.</p>}
      </section>
    </div>
  );
}
