"use client";

import { useState } from "react";
import { X, Coins, Clock, Search, ChevronRight, ShieldCheck, UserX } from "lucide-react";
import { clsx } from "clsx";
import type { MemberStatus } from "@/types/domain";
import { Card, Button, Avatar, Badge } from "@/components/ui";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { creditMember, logMemberHours, setPlayerCreditLimit } from "@/app/actions";
import { formatMoney, formatNumber } from "@/lib/format";

export interface MemberRow {
  id: string;
  fullName: string;
  username: string;
  role: "player" | "agent" | "admin";
  kycStatus: string;
  balance: number;
  currency: string;
  tableHours: number;
  rake: number;
  hands: number;
  level: number;
  status: MemberStatus;
  clubggId?: string;
  creditLimit: number;
  /** True when this member reports directly to the viewing agent. */
  isDirect: boolean;
  /** False until the member reaches L1 (KYC verified) — their rake is on hold until then. */
  rakebackEligible: boolean;
  /** True once the member has gone 365+ days without activity. */
  isDormant: boolean;
  inactiveDays: number;
}

const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function MemberManager({
  members,
  agentBalance,
  agentCurrency,
}: {
  members: MemberRow[];
  agentBalance: number;
  agentCurrency: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "dormant">("all");

  const dormantMembers = members.filter((m) => m.isDormant);
  const base = view === "dormant" ? dormantMembers : members;
  const filtered = base.filter(
    (m) =>
      m.fullName.toLowerCase().includes(q.toLowerCase()) ||
      m.username.toLowerCase().includes(q.toLowerCase()),
  );
  const active = members.find((m) => m.id === openId) ?? null;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-100">Members ({members.length})</h2>
        <div className="flex items-center gap-2 rounded-xl bg-felt-900 px-3 py-2 ring-1 ring-inset ring-white/10">
          <Search size={15} className="shrink-0 text-ink-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            className="w-28 min-w-0 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500 sm:w-44"
          />
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-felt-900 p-1">
        <button
          onClick={() => setView("all")}
          className={clsx(
            "flex-1 rounded-lg py-2 text-sm font-medium transition",
            view === "all" ? "bg-emerald-glow/15 text-emerald-soft" : "text-ink-400 hover:text-ink-200",
          )}
        >
          All members
        </button>
        <button
          onClick={() => setView("dormant")}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition",
            view === "dormant" ? "bg-ember-500/15 text-ember-300" : "text-ink-400 hover:text-ink-200",
          )}
        >
          <UserX size={14} />
          Dormant
          {dormantMembers.length > 0 && <Badge tone="ember">{dormantMembers.length}</Badge>}
        </button>
      </div>

      {view === "dormant" && dormantMembers.length > 0 && (
        <p className="mb-3 text-xs text-ink-500">
          These members haven&apos;t been active in 365+ days and are free to switch to a different
          agent at any time.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-400">
          {view === "dormant" ? "No dormant members — everyone's active. 🎉" : "No members found."}
        </p>
      ) : (
        <>
          {/* Card list — phones & narrow tablets. */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setOpenId(m.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-inset ring-white/5 transition hover:bg-white/[0.06]"
                >
                  <Avatar name={m.fullName} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-medium text-ink-100">{m.fullName}</p>
                      {m.role === "agent" ? (
                        <span className="shrink-0 rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] font-medium text-gold-300 ring-1 ring-inset ring-gold-500/30">
                          Agent
                        </span>
                      ) : (
                        <span className="shrink-0">
                          <MemberStatusBadge status={m.status} level={m.level} />
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {m.tableHours}h · {formatMoney(m.balance, m.currency)} bal ·{" "}
                      <span className={m.rakebackEligible ? "text-gold-300" : "text-ember-400"}>
                        {formatMoney(m.rake, m.currency)}
                      </span>{" "}
                      rake{!m.rakebackEligible && " (on hold)"}
                      {m.isDormant && <span className="text-ember-400"> · inactive {formatNumber(m.inactiveDays)}d</span>}
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-ink-500" />
                </button>
              </li>
            ))}
          </ul>

          {/* Full table — tablet & desktop. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-2 py-2">Member</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Hours</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">Rake</th>
                  <th className="px-2 py-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((m) => (
                  <tr key={m.id} className="text-ink-200">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.fullName} size={28} />
                        <div>
                          <p className="flex items-center gap-1.5 font-medium text-ink-100">
                            {m.fullName}
                            {m.isDormant && (
                              <span className="rounded-full bg-ember-500/15 px-1.5 py-0.5 text-[10px] font-medium text-ember-300">
                                {formatNumber(m.inactiveDays)}d inactive
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-ink-500">@{m.username}{m.clubggId ? ` · ClubGG ${m.clubggId}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      {m.role === "agent" ? (
                        <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] font-medium text-gold-300 ring-1 ring-inset ring-gold-500/30">
                          Agent
                        </span>
                      ) : (
                        <MemberStatusBadge status={m.status} level={m.level} />
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">{m.tableHours}h</td>
                    <td className="px-2 py-2.5 text-right">{formatMoney(m.balance, m.currency)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className={m.rakebackEligible ? "gold-text font-medium" : "text-ember-400"}>
                        {formatMoney(m.rake, m.currency)}
                      </span>
                      {!m.rakebackEligible && <p className="text-[10px] text-ember-300">on hold</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        onClick={() => setOpenId(m.id)}
                        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-emerald-soft ring-1 ring-inset ring-white/10 hover:bg-white/10"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {active && (
        <ManageDrawer
          member={active}
          onClose={() => setOpenId(null)}
          agentBalance={agentBalance}
          agentCurrency={agentCurrency}
          allocatedElsewhere={members
            .filter((m) => m.isDirect && m.id !== active.id)
            .reduce((s, m) => s + m.creditLimit, 0)}
        />
      )}
    </Card>
  );
}

function ManageDrawer({
  member,
  onClose,
  agentBalance,
  agentCurrency,
  allocatedElsewhere,
}: {
  member: MemberRow;
  onClose: () => void;
  agentBalance: number;
  agentCurrency: string;
  allocatedElsewhere: number;
}) {
  const available = Math.max(0, agentBalance - allocatedElsewhere);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="card-surface max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={member.fullName} size={44} ring />
            <div>
              <p className="font-semibold text-ink-100">{member.fullName}</p>
              <p className="text-xs text-ink-500">@{member.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-ink-300 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="Balance" value={formatMoney(member.balance, member.currency)} />
          <Mini label="Hours" value={`${member.tableHours}h`} />
          <Mini label="KYC" value={member.kycStatus} />
        </div>

        {!member.rakebackEligible && (
          <p className="mb-4 rounded-xl bg-ember-500/10 p-3 text-[11px] text-ember-300 ring-1 ring-inset ring-ember-500/25">
            This player is L0 — their rake doesn&apos;t count toward your commission and they can&apos;t
            receive rakeback credits until KYC is verified (Level 1).
          </p>
        )}

        {/* Credit chips */}
        <Section icon={<Coins size={15} />} title="Credit chips">
          <p className="mb-2 text-[11px] text-ink-500">
            Your balance: <span className="font-medium text-ink-300">{formatMoney(agentBalance, agentCurrency)}</span> —
            credits come out of your own funds.
          </p>
          <form action={creditMember} className="space-y-2">
            <input type="hidden" name="memberId" value={member.id} />
            <div className="grid grid-cols-2 gap-2">
              <select name="type" className={inputCls} defaultValue={member.rakebackEligible ? "rake_rebate" : "adjustment"}>
                <option value="rake_rebate" disabled={!member.rakebackEligible}>
                  Rakeback{!member.rakebackEligible ? " (needs KYC)" : ""}
                </option>
                <option value="deposit">Deposit</option>
                <option value="adjustment">Adjustment</option>
              </select>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                max={(agentBalance / 100).toFixed(2)}
                placeholder="50.00"
                className={inputCls}
                required
              />
            </div>
            <input name="note" placeholder="Note (optional)" className={inputCls} />
            <Button type="submit" className="w-full" disabled={agentBalance <= 0}>
              {agentBalance <= 0 ? "Insufficient balance" : "Credit member"}
            </Button>
          </form>
        </Section>

        {/* Per-player credit limit */}
        {member.role === "player" && member.isDirect && (
          <Section icon={<ShieldCheck size={15} />} title="Credit limit">
            <p className="mb-2 text-[11px] text-ink-500">
              Current limit: <span className="font-medium text-ink-300">{formatMoney(member.creditLimit, member.currency)}</span>
              {" · "}Allocated elsewhere: {formatMoney(allocatedElsewhere, agentCurrency)} of{" "}
              {formatMoney(agentBalance, agentCurrency)} available
            </p>
            <form action={setPlayerCreditLimit} className="flex gap-2">
              <input type="hidden" name="playerId" value={member.id} />
              <input
                name="creditLimit"
                type="number"
                min="0"
                step="0.01"
                max={(available / 100).toFixed(2)}
                defaultValue={(member.creditLimit / 100).toFixed(2)}
                className={inputCls}
                required
              />
              <Button type="submit" variant="ghost" className="shrink-0">Set limit</Button>
            </form>
            <p className="mt-1 text-[11px] text-ink-500">
              How far negative this player's balance may go before it's charged to you.
            </p>
          </Section>
        )}

        {/* Log table hours */}
        <Section icon={<Clock size={15} />} title="Log table hours">
          <form action={logMemberHours} className="flex gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <input name="hours" type="number" min="0" step="0.5" defaultValue={member.tableHours} className={inputCls} required />
            <Button type="submit" variant="ghost" className="shrink-0">Update</Button>
          </form>
          <p className="mt-1 text-[11px] text-ink-500">4h+ promotes a verified player to VIP.</p>
        </Section>

        {/* Agent promotion is request → admin approval, not an agent action. */}
        {member.role === "player" && (
          <p className="rounded-xl bg-white/[0.03] p-3 text-[11px] text-ink-500 ring-1 ring-inset ring-white/5">
            Agent promotions are approved by the admin. Eligible players request it from their dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium capitalize text-ink-100">{value}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-200">
        <span className="text-emerald-soft">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}
