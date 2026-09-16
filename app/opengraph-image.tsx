import { ImageResponse } from "next/og";
import { loadRun, rankedMarkets } from "@/lib/site";
import { Frame, og, OG_SIZE } from "./og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Who Knew? — who was positioned before the market knew";

export default function Image() {
  const total = loadRun().results.length;
  const ranked = rankedMarkets();
  const strong = ranked.filter((r) => r.flags[0].score >= 50).length;

  return new ImageResponse(
    (
      <Frame footer={<span>polymarket × nansen</span>}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1, maxWidth: 1000 }}>
          Who was positioned before the market knew?
        </div>
        <div style={{ display: "flex", gap: 48, marginTop: 40, fontSize: 24, color: og.ink2 }}>
          <Stat n={total.toLocaleString("en-US")} label="markets screened" />
          <Stat n={String(ranked.length)} label="had someone early" />
          <Stat n={String(strong)} label="score 50 or more" />
        </div>
      </Frame>
    ),
    size
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 48, color: og.ink, fontWeight: 600 }}>{n}</span>
      <span>{label}</span>
    </div>
  );
}
