import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClusters, walletAppearances } from "@/lib/site";
import { ScoreBadge } from "../../components/Score";
import { Tags, walletTags } from "../../components/WalletTags";
import { day, hoursBetween, leadText, minute, px, short, usd } from "../../components/format";

export const dynamic = "force-dynamic";

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const seen = walletAppearances(address);
  if (!seen.length) notFound();

  // Dossier and trace are stored per market; any copy will do — they describe the wallet.
  const withDossier = seen.find((a) => a.market.dossiers?.[a.flag.wallet]);
  const withTrace = seen.find((a) => a.market.traces?.[a.flag.wallet]);
  const dossier = withDossier?.market.dossiers?.[withDossier.flag.wallet];
  const trace = withTrace?.market.traces?.[withTrace.flag.wallet];
  const s = dossier?.summary;
  const best = seen[0];
  const a = best.flag.wallet.toLowerCase();
  const siblings = loadClusters().twins.filter((t) => t.wallets.some((w) => w.wallet.toLowerCase() === a));
  const newsAt = best.market.jump?.newsAt ?? best.market.jump?.at;

  return (
    <article className="space-y-8">
      <header>
        <p className="text-xs text-muted"><Link href="/" className="hover:text-ink">← all markets</Link></p>
        <h1 className="mt-2 font-mono text-lg break-all">{best.flag.wallet}</h1>
        <p className="mt-1 text-sm text-muted">
          Polymarket proxy wallet ·{" "}
          <a className="underline decoration-line hover:text-ink" href={`https://polymarket.com/profile/${best.flag.wallet}`} target="_blank" rel="noreferrer">polymarket ↗</a>
          {trace?.owner && (
            <> · owner <a className="font-mono underline decoration-line hover:text-ink" href={`https://polygonscan.com/address/${trace.owner}`} target="_blank" rel="noreferrer">{short(trace.owner)} ↗</a></>
          )}
        </p>
        <div className="mt-3"><Tags tags={walletTags({ dossier, trace, newsAt })} /></div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4 text-sm">
        {s ? (
          <>
            <Stat label="first seen" value={day(s.first_seen)} sub={`${s.wallet_age_days} days old`} />
            <Stat label="markets traded" value={s.markets_traded.toLocaleString("en-US")} sub={`${s.markets_won} won · ${Math.round(s.win_rate * 100)}%`} />
            <Stat label="lifetime pnl" value={usd(s.total_pnl_usd)} sub={`${usd(s.realized_pnl_usd)} realised`} />
            <Stat label="flagged in" value={String(seen.length)} sub={seen.length === 1 ? "market" : "markets"} />
          </>
        ) : (
          <p className="text-muted sm:col-span-4">Not profiled — this wallet scored below the profiling threshold.</p>
        )}
      </section>

      {trace && (
        <section className="rounded-lg border border-line bg-panel p-4 text-sm space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">where the money came from</h2>
          {!trace.owner && <p className="text-ink-2">Nansen could not resolve this proxy to its owner, so the funding trail stops here. Age, history and timing above still stand.</p>}
          {trace.owner && trace.funder && (
            <p className="text-ink-2">
              The owner wallet received its first gas on <span className="text-ink">{trace.funder.chain}</span> at{" "}
              <span className="num text-ink">{minute(trace.funder.block_timestamp.replace("Z", ""))}</span> from{" "}
              <span className="text-ink">{trace.funder.first_funder_name || short(trace.funder.first_funder_address)}</span>
              {newsAt && hoursBetween(trace.funder.block_timestamp.replace("Z", ""), newsAt) > 0 && (
                <> — {leadText(hoursBetween(trace.funder.block_timestamp.replace("Z", ""), newsAt))} before the market learned.</>
              )}
            </p>
          )}
          {trace.owner && !trace.funder && <p className="text-ink-2">Owner resolved, but no first-funder attribution.</p>}
          {trace.related.length > 0 && (
            <p className="text-xs text-muted">
              related wallets: {trace.related.slice(0, 6).map((w) => `${short(w.address)}${w.address_label ? ` [${w.address_label}]` : ""} (${w.relation})`).join(" · ")}
            </p>
          )}
        </section>
      )}

      {siblings.length > 0 && (
        <section className="rounded-lg border border-series-2/50 bg-panel p-4 text-sm space-y-1">
          <h2 className="text-xs uppercase tracking-wider text-muted">moves with</h2>
          {siblings.map((t, i) => {
            const other = t.wallets.find((w) => w.wallet.toLowerCase() !== a)!;
            return (
              <p key={i} className="text-ink-2">
                <Link href={`/wallet/${other.wallet}`} className="font-mono text-xs hover:underline">{short(other.wallet)}</Link> on{" "}
                <Link href={`/market/${t.market_id}`} className="hover:underline">{t.question}</Link> — last buys {t.deltaLastMin} min apart
                {t.sameFirstSeen ? `, both first seen ${t.sameFirstSeen}` : ""}{t.strength === "weak" ? " (weak)" : ""}.
              </p>
            );
          })}
        </section>
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wider text-muted">positions before the news</h2>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-panel">
          {seen.map(({ market: m, flag: f }) => {
            const at = m.jump?.newsAt ?? m.jump?.at ?? "";
            return (
              <li key={m.market.market_id} className="p-4 grid grid-cols-[2.5rem_1fr] gap-4 text-sm">
                <ScoreBadge score={f.score} />
                <div>
                  <Link href={`/market/${m.market.market_id}`} className="font-medium hover:underline">{m.market.question}</Link>
                  <p className="mt-1 num text-ink-2">
                    {usd(f.position.costUsd)} at {px(f.position.avgPrice)} · {f.position.trades} buys · last one {leadText(hoursBetween(f.position.lastBuyAt, at))} before the news · market was at {px(m.jump!.priceBefore)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {dossier && dossier.history.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-muted">other markets this wallet traded, by pnl</h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-panel text-sm">
            {dossier.history.slice(0, 15).map((h) => (
              <li key={h.market_id} className="px-4 py-2 flex items-baseline justify-between gap-4">
                <span className="text-ink-2 truncate">{h.question}</span>
                <span className="num shrink-0">{h.side_held} · {usd(h.net_buy_cost_usd)} → <span className={h.total_pnl_usd >= 0 ? "text-good" : "text-critical"}>{usd(h.total_pnl_usd)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 num text-lg">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
