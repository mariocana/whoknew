import Link from "next/link";
import { loadWatch } from "@/lib/site";
import { ScoreBadge } from "../components/Score";
import { Tags, walletTags } from "../components/WalletTags";
import { day, px, short, usd, usdK } from "../components/format";

export const dynamic = "force-dynamic";

export default function WatchPage() {
  const run = loadWatch();
  if (!run) {
    return <p className="text-muted">No watch pass has been run yet. <code>npm run watch</code> produces one.</p>;
  }
  const ranked = run.results.filter((r) => r.flags[0]).sort((a, b) => b.flags[0].score - a.flags[0].score);
  const quiet = run.results.length - ranked.length;
  const asOf = run.ranAt.slice(0, 16).replace("T", " ") + " UTC";

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs text-muted"><Link href="/" className="hover:text-ink">← ranked markets</Link></p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Conviction building now</h1>
        <p className="mt-3 text-ink-2 leading-relaxed">
          The same measurement, before the answer: open markets closing within {run.params.days} days where a side is
          still priced at 60¢ or less, and the wallets that took size on it as takers in the last {run.params.hours} hours.
          No news moment yet, so recency stands in for timing. When one of these markets re-prices, the flag was here first —
          or it was wrong, and that is recorded too.
        </p>
        <p className="mt-3 text-sm text-muted">
          as of {asOf} · {run.results.length} markets watched · {ranked.length} with someone taking size cheaply · {quiet} quiet
        </p>
      </section>

      <ul className="divide-y divide-line">
        {ranked.map((r) => {
          const f = r.flags[0];
          const s = f.summary;
          const dossier = s ? { summary: s, history: [], oneShot: s.markets_traded <= 2, fetchedAt: run.ranAt } : undefined;
          const tags = walletTags({ dossier, newsAt: run.ranAt.slice(0, 19), live: true });
          return (
            <li key={r.market.market_id} className="py-4 grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_18rem] gap-x-4 gap-y-2">
              <ScoreBadge score={f.score} />
              <div className="min-w-0">
                <h3 className="font-medium leading-snug">
                  <a className="hover:underline" href={`https://polymarket.com/market/${r.market.slug}`} target="_blank" rel="noreferrer">{r.market.question}</a>
                </h3>
                <p className="mt-1 text-xs text-muted">
                  closes {day(r.market.end_date)} · {usdK(r.market.volume)} traded ·{" "}
                  <span className="text-ink-2">{f.side}</span> now at <span className="num text-ink-2">{px(f.currentPrice)}</span> ·{" "}
                  {usd(r.recentUsd)} taken on unlikely sides by {r.recentWallets} wallets in {run.params.hours}h
                </p>
                <div className="mt-2"><Tags tags={tags} /></div>
                {r.flags.length > 1 && (
                  <p className="mt-2 text-xs text-muted">
                    also: {r.flags.slice(1, 4).map((g) => `${short(g.wallet)} ${usd(g.position.costUsd)} on ${g.side} @${px(g.position.avgPrice)}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="col-start-2 sm:col-start-3 text-sm">
                <p><Link href={`/wallet/${f.wallet}`} className="font-mono text-xs text-muted hover:underline">{f.wallet.slice(0, 10)}…</Link></p>
                <p className="num"><span className="font-medium">{usd(f.position.costUsd)}</span> on {f.side} at {px(f.position.avgPrice)}</p>
                <p className="text-xs text-ink-2">last buy {f.hoursSinceLastBuy < 48 ? `${f.hoursSinceLastBuy.toFixed(0)}h` : `${Math.round(f.hoursSinceLastBuy / 24)}d`} ago · {f.position.trades} buys</p>
                {s && <p className="text-xs text-muted">first seen {s.first_seen.slice(0, 10)} · {s.markets_traded} markets · {Math.round(s.win_rate * 100)}% win</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
