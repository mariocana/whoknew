import Link from "next/link";
import { loadClusters } from "@/lib/site";
import { ScoreBadge } from "../components/Score";
import { day, minute, short, usd } from "../components/format";

export const dynamic = "force-dynamic";

export default function ClustersPage() {
  const { repeaters, twins, sharedFunders } = loadClusters();
  const strong = twins.filter((t) => t.strength === "strong");
  const weak = twins.filter((t) => t.strength === "weak");

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs text-muted"><Link href="/" className="hover:text-ink">← ranked markets</Link></p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Wallets that move together</h1>
        <p className="mt-3 text-ink-2 leading-relaxed">
          One wallet is a bet. Two wallets created the same day that stop buying the same minute are a person.
          Three signals, all from data already in hand: pairs whose buying starts and stops together — as takers,
          never sharing a fill, so one order sweeping several resting makers does not pass as coordination; wallets
          flagged in more than one market; and owners with a common first funder.
        </p>
      </section>

      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm uppercase tracking-wider text-muted">pairs that start and stop together</h2>
          <span className="num text-xs text-muted">{strong.length} strong · {weak.length} weak</span>
        </div>
        <ul className="mt-3 space-y-3">
          {[...strong, ...weak].map((t, i) => (
            <li key={i} className={`rounded-lg border bg-panel p-4 ${t.strength === "strong" ? "border-series-2/50" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/market/${t.market_id}`} className="font-medium hover:underline">{t.question}</Link>
                <span className="text-xs text-muted">
                  {t.sameFirstSeen ? <>both wallets first seen <span className="text-ink-2">{t.sameFirstSeen}</span> · </> : null}
                  last buys <span className="num text-ink-2">{t.deltaLastMin} min</span> apart
                  {t.deltaFirstMin <= 30 && <> · first buys <span className="num text-ink-2">{t.deltaFirstMin} min</span> apart</>}
                  {t.strength === "weak" && <> · <span title="Same half hour, no shared birthday — could be two people reading the same headline.">weak</span></>}
                </span>
              </div>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
                {t.wallets.map((w) => (
                  <li key={w.wallet} className="flex items-start gap-3">
                    <ScoreBadge score={w.score} />
                    <div>
                      <Link href={`/wallet/${w.wallet}`} className="font-mono text-xs hover:underline">{short(w.wallet)}</Link>
                      <p className="num">{usd(w.costUsd)} · {Math.round(w.takerShare * 100)}% taken, not filled</p>
                      <p className="text-xs text-muted">{minute(w.firstBuyAt).slice(0, 16)} → {minute(w.lastBuyAt).slice(11)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm uppercase tracking-wider text-muted">flagged in more than one market</h2>
          <span className="num text-xs text-muted">{repeaters.length}</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-ink-2">
          Positions of $1,000 or more scoring 25 or more, in two or more markets. Some are professionals who are
          simply early often; some are the same story told across sibling markets — the Iran strike wallets bet on
          Saturday, Sunday and Monday at once.
        </p>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-panel text-sm">
          {repeaters.slice(0, 40).map((r) => (
            <li key={r.wallet} className="px-4 py-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
              <Link href={`/wallet/${r.wallet}`} className="font-mono text-xs hover:underline pt-0.5">{short(r.wallet)}</Link>
              <ul className="space-y-1">
                {r.markets.slice(0, 4).map((m) => (
                  <li key={m.market_id} className="flex items-baseline gap-3">
                    <span className="num w-7 text-right text-xs text-ink-2">{m.score}</span>
                    <Link href={`/market/${m.market_id}`} className="truncate hover:underline">{m.question}</Link>
                    <span className="num shrink-0 text-xs text-muted">{usd(m.costUsd)} · {day(m.end_date)}</span>
                  </li>
                ))}
                {r.markets.length > 4 && <li className="text-xs text-muted">{r.markets.length - 4} more</li>}
              </ul>
            </li>
          ))}
        </ul>
        {repeaters.length > 40 && <p className="mt-2 text-xs text-muted">{repeaters.length - 40} more.</p>}
      </section>

      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm uppercase tracking-wider text-muted">owners with a common first funder</h2>
          <span className="num text-xs text-muted">{sharedFunders.length}</span>
        </div>
        {sharedFunders.length === 0 ? (
          <p className="mt-2 max-w-3xl text-sm text-ink-2">
            None among the wallets traced so far. The funding trail exists only where Nansen resolves the proxy to its
            owner — about half of flagged wallets — so this section grows as more are traced.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-panel text-sm">
            {sharedFunders.map((s) => (
              <li key={s.funder} className="px-4 py-3">
                <p>{s.funderName || short(s.funder)} funded {s.wallets.length} flagged owners</p>
                <p className="mt-1 font-mono text-xs text-muted">{s.wallets.map(short).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
