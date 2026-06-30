import type { SeriesPoint } from "@/components/charts/BankrollChart";

/**
 * Build a deterministic, plausible monthly bankroll trend that ENDS at the
 * user's current net profit. Deterministic (seeded by the magnitude) so the
 * chart is stable across renders — no random jitter on the server/client.
 */
export function bankrollSeries(netProfitMinor: number): SeriesPoint[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const end = netProfitMinor / 100;
  // A smooth-ish climb with a mid dip, normalized to land on `end`.
  const shape = [0.0, 0.22, 0.18, 0.55, 0.78, 1.0];
  return months.map((label, i) => ({
    label,
    value: Math.round(end * shape[i]),
  }));
}
