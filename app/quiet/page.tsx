import Link from "next/link";
import { loadRun, quietMarkets, type MarketRecord } from "@/lib/site";
import { day, px, usdK } from "../components/format";

export const dynamic = "force-dynamic";

type Reason = "expected" | "nobody" | "unclear";

function reasonOf(r: MarketRecord): Reason {
  if (r.skipped === "did not resolve cleanly") return "unclear";
  if (r.jump && !r.flags.length) return "nobody";
  return "expected";
}

/** What the market believed before its largest re-pricing, if it ever re-priced at all. */
function believed(r: MarketRecord): string {
  if (!r.jumps.length) return "never re-priced sharply";
  const j = r.jumps.reduce((a, b) => (b.priceAfter - b.priceBefore > a.priceAfter - a.priceBefore ? b : a));
  return `already at ${px(j.priceBefore)} before its biggest move`;
}

const COPY: Record<Reason, { title: string; body: string }> = {
  expected: {
    title: "the market already knew",
    body: "The winning side never re-priced sharply from an unlikely level. Either the outcome was expected all along, or it drifted in over days as the evidence did. There was nothing to know in advance that the crowd did not.",
  },
  nobody: {
    title: "a surprise, but nobody was there early",
    body: "The market did re-price sharply — and in the fourteen days before that minute, no wallet held a meaningful position on the winning side. Whoever knew, if anyone did, did not bet on Polymarket.",
  },
  unclear: {
    title: "could not be measured",
    body: "Either side never closed at 95¢ or above in the candles we hold — for the largest, longest-lived markets the hourly history runs past the eight pages fetched, so the resolution is missing. Nothing to conclude here either way.",
  },
};

export default function QuietPage() {
  const all = quietMarkets();
  const total = loadRun().results.length;
  const groups: Record<Reason, MarketRecord[]> = { expected: [], nobody: [], unclear: [] };
  for (const r of all) groups[reasonOf(r)].push(r);
  for (const k of Object.keys(groups) as Reason[]) groups[k].sort((a, b) => b.market.volume - a.market.volume);

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs text-muted"><Link href="/" className="hover:text-ink">← ranked markets</Link></p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing to see, and why</h1>
        <p className="mt-3 text-ink-2 leading-relaxed">
          {all.length.toLocaleString("en-US")} of the {total.toLocaleString("en-US")} markets screened produced no flag.
          A scanner that only shows its hits is easy to mistrust; this page shows the base rate. Three quarters of the
          time, the answer to &ldquo;who knew?&rdquo; is <em>nobody had to</em>.
        </p>
      </section>

      {(Object.keys(COPY) as Reason[]).map((k) => (
        <section key={k}>
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm uppercase tracking-wider text-muted">{COPY[k].title}</h2>
            <span className="num text-xs text-muted">{groups[k].length}</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-ink-2">{COPY[k].body}</p>
          {groups[k].length > 0 && (
            <ul className="mt-3 rounded-lg border border-line bg-panel divide-y divide-line text-sm">
              {groups[k].slice(0, 40).map((r) => (
                <li key={r.market.market_id} className="px-4 py-2 grid grid-cols-1 sm:grid-cols-[1fr_14rem_5rem_5rem] gap-x-4 gap-y-0.5">
                  <Link href={`/market/${r.market.market_id}`} className="truncate hover:underline">{r.market.question}</Link>
                  <span className="text-xs text-muted">
                    {k !== "unclear" && <span className="text-ink-2">{r.winner}</span>}
                    {k === "expected" ? ` · ${believed(r)}` : k === "nobody" ? ` · re-priced from ${px(r.jump!.priceBefore)} at ${(r.jump!.newsAt ?? r.jump!.at).slice(5, 16).replace("T", " ")}` : "resolution not in the fetched candles"}
                  </span>
                  <span className="num text-xs text-muted sm:text-right">{usdK(r.market.volume)}</span>
                  <span className="num text-xs text-muted sm:text-right">{day(r.market.end_date)}</span>
                </li>
              ))}
              {groups[k].length > 40 && (
                <li className="px-4 py-2 text-xs text-muted">{groups[k].length - 40} more, smaller.</li>
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
