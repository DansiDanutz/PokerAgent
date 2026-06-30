"use client";

import { useState } from "react";
import { X, Coins, Clock, Search } from "lucide-react";
import type { MemberStatus } from "@/types/domain";
import { Card, Button, Avatar } from "@/components/ui";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { creditMember, logMemberHours } from "@/app/actions";
import { formatMoney } from "@/lib/format";

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
}

const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function MemberManager({ members }: { members: MemberRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(q.toLowerCase()) ||
      m.username.toLowerCase().includes(q.toLowerCase()),
  );
  const active = members.find((m) => m.id === openId) ?? null;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-100">Members ({members.length})</h2>
        <div className="flex items-center gap-2 rounded-xl bg-felt-900 px-3 py-2 ring-1 ring-inset ring-white/10">
          <Search size={15} className="text-ink-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            className="bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
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
                      <p className="font-medium text-ink-100">{m.fullName}</p>
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
                <td className="px-2 py-2.5 text-right gold-text font-medium">{formatMoney(m.rake, m.currency)}</td>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-sm text-ink-400">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {active && <ManageDrawer member={active} onClose={() => setOpenId(null)} />}
    </Card>
  );
}

function ManageDrawer({ member, onClose }: { member: MemberRow; onClose: () => void }) {
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

        {/* Credit chips */}
        <Section icon={<Coins size={15} />} title="Credit chips">
          <form action={creditMember} className="space-y-2">
            <input type="hidden" name="memberId" value={member.id} />
            <div className="grid grid-cols-2 gap-2">
              <select name="type" className={inputCls} defaultValue="rake_rebate">
                <option value="rake_rebate">Rakeback</option>
                <option value="deposit">Deposit</option>
                <option value="adjustment">Adjustment</option>
              </select>
              <input name="amount" type="number" min="0.01" step="0.01" placeholder="50.00" className={inputCls} required />
            </div>
            <input name="note" placeholder="Note (optional)" className={inputCls} />
            <Button type="submit" className="w-full">Credit member</Button>
          </form>
        </Section>

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
