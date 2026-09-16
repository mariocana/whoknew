import { ImageResponse } from "next/og";
import { getMarket } from "@/lib/site";
import { walletTags } from "../../components/WalletTags";
import { Frame, og, OG_SIZE, Score } from "../../og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Who Knew? — market";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const px = (p: number) => `${Math.round(p * 100)}¢`;
const hours = (a: string, b: string) => (new Date(b + "Z").getTime() - new Date(a + "Z").getTime()) / 3_600_000;
const lead = (h: number) => (h < 1 / 60 ? `${Math.round(h * 3600)} s` : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} d`);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getMarket(id);
  const f = r?.flags[0];
  const newsAt = r?.jump?.newsAt ?? r?.jump?.at;

  return new ImageResponse(
    (
      <Frame footer={<span>{r ? r.market.end_date.slice(0, 10) : ""}</span>}>
        <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
          {f && <Score value={f.score} />}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.5 }}>
              {r?.market.question ?? "Market not found"}
            </div>
            {r && f && newsAt && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: og.ink2 }}>
                  <span style={{ color: og.ink, fontWeight: 600 }}>{usd(f.position.costUsd)}</span>
                  <span>&nbsp;at {px(f.position.avgPrice)} · last buy {lead(hours(f.position.lastBuyAt, newsAt))} before the market learned</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
                  {walletTags({ dossier: r.dossiers?.[f.wallet], trace: r.traces?.[f.wallet], newsAt }).slice(0, 3).map((t) => (
                    <span key={t.label} style={{ display: "flex", padding: "6px 14px", borderRadius: 8, border: `2px solid ${t.tone === "hot" ? og.accent : og.line}`, fontSize: 22, color: t.tone === "cool" ? og.muted : og.ink }}>
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {r && !f && <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: og.muted }}>nothing to see — the market already knew</div>}
          </div>
        </div>
      </Frame>
    ),
    size
  );
}
