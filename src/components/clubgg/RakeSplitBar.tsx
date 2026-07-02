import { formatMoney } from "@/lib/format";

/**
 * The 3-way split of a pool of rake as one stacked bar with amounts and
 * percentages. Shared by the admin import ("Where the rake goes") and the
 * agent console ("your network's estimated split"). The three amounts should
 * sum to `rake` — the caller guarantees that (the distribution engine does).
 */
export function RakeSplitBar({
  rake,
  players,
  agents,
  admin,
  currency,
  title = "Where the rake goes",
  labels = { players: "Players", agents: "Agents", admin: "Admin" },
}: {
  rake: number;
  players: number;
  agents: number;
  admin: number;
  currency: string;
  title?: string;
  labels?: { players: string; agents: string; admin: string };
}) {
  const pct = (n: number) => (rake > 0 ? (n / rake) * 100 : 0);
  const segments = [
    { label: labels.players, amount: players, cls: "bg-emerald-glow", text: "text-emerald-soft" },
    { label: labels.agents, amount: agents, cls: "bg-gold-500", text: "text-gold-300" },
    { label: labels.admin, amount: admin, cls: "bg-white/25", text: "text-ink-200" },
  ];
  return (
    <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
      <p className="mb-2 text-xs font-semibold text-ink-200">{title}</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-felt-900">
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.cls}
            style={{ width: `${pct(s.amount)}%` }}
            title={`${s.label}: ${formatMoney(s.amount, currency)}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {segments.map((s) => (
          <div key={s.label}>
            <p className={`text-sm font-semibold tabular-nums ${s.text}`}>{formatMoney(s.amount, currency)}</p>
            <p className="text-[11px] text-ink-500">
              {s.label} · {pct(s.amount).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
