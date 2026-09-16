// Shared pieces for the Open Graph images. ImageResponse renders a subset of CSS:
// flex only, inline styles, no Tailwind.
import type { CSSProperties, ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export const og = {
  bg: "#111110",
  panel: "#1a1a19",
  line: "#2a2a28",
  ink: "#f2f1ec",
  ink2: "#c3c2b7",
  muted: "#8a897f",
  accent: "#d95926",
  blue: "#3987e5",
};

export function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: og.bg, color: og.ink, padding: 64, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
        Who Knew<span style={{ color: og.accent }}>?</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: og.muted }}>
        <span>bets that have the shape of information — every number shown, nothing alleged</span>
        {footer}
      </div>
    </div>
  );
}

export function Score({ value, style }: { value: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 140, height: 140, borderRadius: 16, border: `2px solid ${og.line}`, background: og.panel, fontSize: 72, fontWeight: 600, ...style }}>
      {value}
    </div>
  );
}
