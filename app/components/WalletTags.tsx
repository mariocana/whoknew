import type { Dossier } from "../../scripts/profile";
import type { Trace } from "../../scripts/trace";
import { hoursBetween, leadText } from "./format";

export interface TagInput {
  dossier?: Dossier;
  trace?: Trace;
  /** The minute the market re-priced; funding shortly before it is a tag of its own. */
  newsAt?: string;
}

export function walletTags({ dossier, trace, newsAt }: TagInput): { label: string; tone: "hot" | "warm" | "cool" }[] {
  const tags: { label: string; tone: "hot" | "warm" | "cool" }[] = [];
  const s = dossier?.summary;
  if (dossier?.oneShot) tags.push({ label: "only market ever traded", tone: "hot" });
  else if (s && s.markets_traded <= 10) tags.push({ label: `${s.markets_traded} markets in its life`, tone: "warm" });
  // Age at the time of the bet, not today.
  if (s && newsAt) {
    const ageH = hoursBetween(s.first_seen.replace("Z", ""), newsAt);
    if (ageH > 0 && ageH <= 24 * 14) tags.push({ label: `wallet first seen ${leadText(ageH)} before the news`, tone: "hot" });
  }
  if (trace?.funder && newsAt) {
    const h = hoursBetween(trace.funder.block_timestamp.replace("Z", ""), newsAt);
    if (h > 0 && h <= 72) tags.push({ label: `first funded ${leadText(h)} before the news`, tone: "hot" });
    else tags.push({ label: `funded by ${trace.funder.first_funder_name || "an unlabelled wallet"}`, tone: "cool" });
  }
  if (s && s.markets_traded >= 200) tags.push({ label: `${s.markets_traded.toLocaleString("en-US")} markets — a regular`, tone: "cool" });
  if (s && s.markets_traded >= 20 && s.win_rate >= 0.8) tags.push({ label: `${Math.round(s.win_rate * 100)}% win rate`, tone: "warm" });
  if (trace && !trace.owner) tags.push({ label: "owner unresolved", tone: "cool" });
  return tags;
}

export function Tags({ tags }: { tags: ReturnType<typeof walletTags> }) {
  if (!tags.length) return null;
  const tone = { hot: "border-series-2/60 text-ink", warm: "border-warning/50 text-ink-2", cool: "border-line text-muted" };
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <li key={t.label} className={`rounded border px-1.5 py-0.5 text-[11px] leading-tight ${tone[t.tone]}`}>
          {t.label}
        </li>
      ))}
    </ul>
  );
}
