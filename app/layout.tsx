import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Who Knew?", template: "%s · Who Knew?" },
  description: "Who was positioned before the market knew? Polymarket bets with the shape of information, on Nansen data.",
  openGraph: { siteName: "Who Knew?", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-4 flex items-baseline justify-between gap-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Who Knew<span className="text-series-2">?</span>
            </Link>
            <p className="text-xs text-muted hidden sm:block">
              bets that have the shape of information — every number shown, nothing alleged
            </p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-8 flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-4 text-xs text-muted flex flex-wrap gap-x-6 gap-y-1">
            <span>Data: Nansen prediction-market and profiler APIs. Positions are floors — mints are invisible in the trade feed.</span>
            <span>Scores describe the shape of a bet, not the intent of a person.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
