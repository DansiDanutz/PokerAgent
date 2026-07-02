import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card, SectionTitle, Stat, Badge } from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/format";

export interface AgentExposureRow {
  id: string;
  username: string;
  fullName: string;
  status: string;
  /** The agent's own balance (minor units). */
  balance: number;
  /** Sum of credit limits extended to this agent's DIRECT players (minor units). */
  committed: number;
  /** Admin-granted credit line — how far the agent's balance may go negative (minor units). */
  creditLine: number;
  currency: string;
}

/**
 * Fleet-wide view of every agent's credit-limit commitments vs. their actual
 * balance. The app enforces "balance can't drop below committed limits" for
 * agent-initiated actions (transfers, crediting players) — but admin actions
 * (adjustBalance) are intentionally exempt, since admin has full override
 * power. That means an admin action CAN leave an agent under-collateralized,
 * and this is the only place that becomes visible instead of surfacing later
 * as a surprise when a sweep can't fully recover a player's debt.
 */
export function AgentExposure({ agents }: { agents: AgentExposureRow[] }) {
  const withCommitments = agents.filter((a) => a.committed > 0);
  const totalCommitted = agents.reduce((s, a) => s + a.committed, 0);
  const atRisk = agents.filter((a) => a.balance - a.committed < 0);

  const ranked = [...withCommitments].sort((a, b) => {
    const riskA = a.balance - a.committed;
    const riskB = b.balance - b.committed;
    return riskA - riskB; // most at-risk (most negative headroom) first
  });

  return (
    <Card glow={atRisk.length > 0 ? "ember" : undefined}>
      <SectionTitle
        title="Agent credit exposure"
        subtitle="Every agent's balance vs. what they've committed to their players' credit limits"
        action={
          <Badge tone={atRisk.length > 0 ? "danger" : "emerald"}>
            {atRisk.length > 0 ? `${atRisk.length} at risk` : "All covered"}
          </Badge>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Agents with limits extended" value={String(withCommitments.length)} />
        <Stat label="Total committed" value={formatMoney(totalCommitted, "USD")} tone="gold" />
        <Stat label="Agents at risk" value={String(atRisk.length)} tone={atRisk.length > 0 ? "down" : "up"} />
      </div>

      {ranked.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No agent has extended a player credit limit yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {ranked.map((a) => {
            const available = a.balance - a.committed;
            const pctUsed = a.balance > 0 ? Math.min(1, a.committed / a.balance) : a.committed > 0 ? 1 : 0;
            const state = available < 0 ? "risk" : pctUsed >= 0.8 ? "tight" : "ok";
            const Icon = state === "risk" ? ShieldAlert : state === "tight" ? ShieldQuestion : ShieldCheck;
            const tone = state === "risk" ? "text-[var(--color-danger)]" : state === "tight" ? "text-[var(--color-warning)]" : "text-emerald-soft";
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <Icon size={16} className={`shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">
                    {a.fullName} <span className="text-ink-500">@{a.username}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatMoney(a.committed, a.currency)} committed of {formatMoney(a.balance, a.currency)} balance
                    {" · "}
                    {formatPercent(pctUsed, 0)} used
                    {a.creditLine > 0 && <> · line {formatMoney(a.creditLine, a.currency)}</>}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${tone}`}>
                  {available < 0 ? "−" : ""}
                  {formatMoney(Math.abs(available), a.currency)}
                </span>
                {a.status !== "active" && <Badge tone="neutral">{a.status}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
