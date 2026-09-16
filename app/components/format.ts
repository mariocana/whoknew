export const usd = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;
export const usdK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `$${Math.round(n / 1000)}k` : usd(n);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const px = (p: number) => `${Math.round(p * 100)}¢`;
export const day = (iso: string) => iso.slice(0, 10);
export const minute = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

export function lead(hoursText: string) {
  return hoursText.replace("last buy ", "").replace(" before the news", "");
}

export function hoursBetween(a: string, b: string) {
  return (new Date(b + (b.endsWith("Z") ? "" : "Z")).getTime() - new Date(a + (a.endsWith("Z") ? "" : "Z")).getTime()) / 3_600_000;
}

export function leadText(hours: number) {
  if (hours < 1 / 60) return `${Math.round(hours * 3600)} s`;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} d`;
}
