"use client";

import { useActionState, useRef, useState } from "react";
import { FileSpreadsheet, Eye, CheckCircle2, AlertTriangle, Coins, Users } from "lucide-react";
import { Card, SectionTitle, Button, Stat, Badge } from "@/components/ui";
import { runStatsImport, type StatsImportState } from "@/app/actions";
import { formatMoney, formatNumber } from "@/lib/format";

const initial: StatsImportState = {};

const SAMPLE =
  "member_id,nickname,agent,hands,rake,buy_in,cash_out\n8842014,alexplayer,PAGENT-ARJUN12,1240,21.50,500.00,715.50";

/**
 * ClubGG "Club Data" stats import. The engine is money-moving, so it is
 * strictly two-step: PREVIEW computes the full distribution (stat deltas,
 * player rakeback, agent settlements) without touching a single balance;
 * APPLY re-computes server-side and commits. The admin always sees the exact
 * numbers before anything settles.
 */
export function StatsImport({ currency = "USD" }: { currency?: string }) {
  const [state, action, pending] = useActionState(runStatsImport, initial);
  const [fileName, setFileName] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load a .csv from disk straight into the textarea (client-only convenience).
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    file.text().then((t) => {
      if (textareaRef.current) textareaRef.current.value = t;
    });
  };

  const plan = state.plan;
  const canApply = !!plan && !state.applied;

  return (
    <Card glow="gold">
      <SectionTitle
        title="ClubGG stats import"
        subtitle="Distribute a downloaded Club Data period — rake, rakeback & agent settlements"
      />

      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-ink-200 ring-1 ring-inset ring-white/10 hover:bg-white/10">
            <FileSpreadsheet size={14} /> {fileName ?? "Choose CSV file…"}
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          <span className="text-[11px] text-ink-500">…or paste the rows below.</span>
        </div>

        <textarea
          ref={textareaRef}
          name="csv"
          rows={5}
          placeholder={SAMPLE}
          className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 font-mono text-xs text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-gold-500/50"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="mode" value="preview" variant="ghost" disabled={pending}>
            <Eye size={15} /> {pending ? "Working…" : "Preview distribution"}
          </Button>
          {canApply && (
            <Button type="submit" name="mode" value="apply" disabled={pending}>
              <CheckCircle2 size={15} /> Apply &amp; settle
            </Button>
          )}
        </div>
      </form>

      {state.error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-danger)]">
          <AlertTriangle size={14} /> {state.error}
        </p>
      )}

      {state.applied && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-glow/10 px-3 py-2 text-sm text-emerald-soft ring-1 ring-inset ring-emerald-glow/20">
          <CheckCircle2 size={16} /> Distribution applied — stats, rakeback and settlements are live.
        </p>
      )}

      {plan && <PlanView plan={plan} applied={!!state.applied} currency={currency} warnings={state.parseWarnings} />}
    </Card>
  );
}

function PlanView({
  plan,
  applied,
  currency,
  warnings,
}: {
  plan: NonNullable<StatsImportState["plan"]>;
  applied: boolean;
  currency: string;
  warnings?: string[];
}) {
  const t = plan.totals;
  return (
    <div className="mt-4 space-y-4">
      {!applied && (
        <p className="text-[11px] uppercase tracking-wider text-gold-300">Preview — nothing has moved yet</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={`${formatNumber(t.matched)}/${formatNumber(t.members)}`} hint={t.unmatched ? `${t.unmatched} unlinked` : "all linked"} />
        <Stat label="Total rake" value={formatMoney(t.rake, currency)} tone="gold" />
        <Stat label="Distributed" value={formatMoney(t.playerRakeback + t.commission, currency)} tone="up" hint="players + agents" />
        <Stat label="Admin keeps" value={formatMoney(t.adminKept, currency)} tone="gold" hint="the house cut" />
      </div>

      {/* Where the rake goes — the 3-way split, every dollar accounted for. */}
      <RakeSplitBar
        rake={t.rake}
        players={t.playerRakeback}
        agents={t.commission}
        admin={t.adminKept}
        currency={currency}
      />

      {/* Member distribution */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-white/5">
        <table className="w-full min-w-[540px] text-left text-xs">
          <thead className="bg-white/[0.03] text-ink-400">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 text-right font-medium">Hands</th>
              <th className="px-3 py-2 text-right font-medium">Rake</th>
              <th className="px-3 py-2 text-right font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium">Agents</th>
              <th className="px-3 py-2 text-right font-medium">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {plan.lines.map((l, i) => (
              <tr key={`${l.clubggId}-${i}`} className={l.matched ? "" : "opacity-50"}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <Coins size={12} className="text-ink-500" />
                    {l.matched ? (
                      <span className="text-ink-100">@{l.username}</span>
                    ) : (
                      <span className="text-ink-400">{l.nickname ?? l.clubggId}</span>
                    )}
                    {!l.matched && <Badge tone="warning">unlinked</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatNumber(l.handsPlayed)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gold-300">{formatMoney(l.rake, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.playerRakeback > 0 ? (
                    <span className="text-emerald-soft">{formatMoney(l.playerRakeback, currency)}</span>
                  ) : (
                    <span className="text-ink-600">{l.matched && !l.rakebackEligible ? "not L1" : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-300">
                  {l.agentShare > 0 ? formatMoney(l.agentShare, currency) : <span className="text-ink-600">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-400">{formatMoney(l.adminShare, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Agent settlements — each agent's total override across their downline */}
      {plan.settlements.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-300">
            <Users size={13} /> Agent settlements
          </p>
          <ul className="divide-y divide-white/5 rounded-xl ring-1 ring-inset ring-white/5">
            {plan.settlements.map((s) => (
              <li key={s.agentId} className="flex items-center gap-x-3 px-3 py-2.5 text-xs">
                <span className="min-w-0 flex-1 text-ink-100">@{s.username}</span>
                <span className="text-[11px] text-ink-500">override commission</span>
                <span className="tabular-nums font-semibold text-emerald-soft">{formatMoney(s.commission, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(warnings?.length || plan.warnings.length) > 0 && (
        <ul className="space-y-1 text-[11px] text-[var(--color-warning)]">
          {[...(warnings ?? []), ...plan.warnings].slice(0, 8).map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The 3-way split of total rake — Players / Agents / Admin — as a single
 * stacked bar with amounts and percentages. Directly answers "how much does
 * each party get". The three always sum to total rake.
 */
function RakeSplitBar({
  rake,
  players,
  agents,
  admin,
  currency,
}: {
  rake: number;
  players: number;
  agents: number;
  admin: number;
  currency: string;
}) {
  const pct = (n: number) => (rake > 0 ? (n / rake) * 100 : 0);
  const segments = [
    { label: "Players", amount: players, cls: "bg-emerald-glow", text: "text-emerald-soft" },
    { label: "Agents", amount: agents, cls: "bg-gold-500", text: "text-gold-300" },
    { label: "Admin", amount: admin, cls: "bg-white/25", text: "text-ink-200" },
  ];
  return (
    <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
      <p className="mb-2 text-xs font-semibold text-ink-200">Where the rake goes</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-felt-900">
        {segments.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${pct(s.amount)}%` }} title={`${s.label}: ${formatMoney(s.amount, currency)}`} />
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
