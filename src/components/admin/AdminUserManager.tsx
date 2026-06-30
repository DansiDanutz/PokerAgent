"use client";

import { useState } from "react";
import { X, Search, BadgeCheck, Ban, Shield, Coins, ChevronRight } from "lucide-react";
import { Card, Button, Avatar, Badge } from "@/components/ui";
import { setKyc, setAccountStatus, setUserRole, adminAdjustBalance } from "@/app/actions";
import { formatMoney } from "@/lib/format";

export interface AdminUserRow {
  id: string;
  fullName: string;
  username: string;
  role: "player" | "agent" | "admin";
  kycStatus: string;
  status: string;
  balance: number;
  currency: string;
  rake: number;
  clubggId?: string;
  uplineAgentId: string | null;
}

const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

const KYC_TONE: Record<string, string> = {
  verified: "emerald", pending: "warning", unverified: "neutral", rejected: "danger",
};
const STATUS_TONE: Record<string, string> = {
  active: "emerald", suspended: "warning", banned: "danger",
};

export function AdminUserManager({ users }: { users: AdminUserRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "player" | "agent" | "admin">("all");

  const filtered = users.filter((u) => {
    const matchesQ =
      u.fullName.toLowerCase().includes(q.toLowerCase()) ||
      u.username.toLowerCase().includes(q.toLowerCase()) ||
      (u.clubggId ?? "").includes(q);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesQ && matchesRole;
  });
  const active = users.find((u) => u.id === openId) ?? null;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-100">User management ({users.length})</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-felt-900 p-1">
            {(["all", "player", "agent", "admin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                  roleFilter === r ? "bg-emerald-glow/15 text-emerald-soft" : "text-ink-400 hover:text-ink-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-felt-900 px-3 py-2 ring-1 ring-inset ring-white/10">
            <Search size={15} className="text-ink-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-24 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500 sm:w-36"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-400">No users found.</p>
      ) : (
        <>
          {/* Card list — phones & narrow tablets. */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => setOpenId(u.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-inset ring-white/5 transition hover:bg-white/[0.06]"
                >
                  <Avatar name={u.fullName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-100">{u.fullName}</p>
                    <p className="text-xs text-ink-500">@{u.username}{u.clubggId ? ` · ${u.clubggId}` : ""}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={u.role === "agent" ? "gold" : u.role === "admin" ? "emerald" : "neutral"}>{u.role}</Badge>
                      <Badge tone={KYC_TONE[u.kycStatus]}>{u.kycStatus}</Badge>
                      <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                      <span className="text-xs font-medium text-ink-300">{formatMoney(u.balance, u.currency)}</span>
                    </div>
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
                  <th className="px-2 py-2">User</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">KYC</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((u) => (
                  <tr key={u.id} className="text-ink-200">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.fullName} size={28} />
                        <div>
                          <p className="font-medium text-ink-100">{u.fullName}</p>
                          <p className="text-[11px] text-ink-500">@{u.username}{u.clubggId ? ` · ${u.clubggId}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><Badge tone={u.role === "agent" ? "gold" : u.role === "admin" ? "emerald" : "neutral"}>{u.role}</Badge></td>
                    <td className="px-2 py-2.5"><Badge tone={KYC_TONE[u.kycStatus]}>{u.kycStatus}</Badge></td>
                    <td className="px-2 py-2.5"><Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge></td>
                    <td className="px-2 py-2.5 text-right">{formatMoney(u.balance, u.currency)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        onClick={() => setOpenId(u.id)}
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

      {active && <AdminDrawer user={active} onClose={() => setOpenId(null)} />}
    </Card>
  );
}

function AdminDrawer({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="card-surface max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size={44} ring />
            <div>
              <p className="font-semibold text-ink-100">{user.fullName}</p>
              <p className="text-xs text-ink-500">@{user.username} · {formatMoney(user.balance, user.currency)}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-ink-300 hover:bg-white/10"><X size={16} /></button>
        </div>

        {/* KYC */}
        <Section icon={<BadgeCheck size={15} />} title={`KYC — ${user.kycStatus}`}>
          <div className="grid grid-cols-3 gap-2">
            <ActionBtn action={setKyc.bind(null, user.id, "verified")} label="Verify" tone="emerald" />
            <ActionBtn action={setKyc.bind(null, user.id, "pending")} label="Pending" tone="neutral" />
            <ActionBtn action={setKyc.bind(null, user.id, "rejected")} label="Reject" tone="danger" />
          </div>
        </Section>

        {/* Account status */}
        <Section icon={<Ban size={15} />} title={`Account — ${user.status}`}>
          <div className="grid grid-cols-3 gap-2">
            <ActionBtn action={setAccountStatus.bind(null, user.id, "active")} label="Active" tone="emerald" disabled={user.role === "admin"} />
            <ActionBtn action={setAccountStatus.bind(null, user.id, "suspended")} label="Suspend" tone="neutral" disabled={user.role === "admin"} />
            <ActionBtn action={setAccountStatus.bind(null, user.id, "banned")} label="Ban" tone="danger" disabled={user.role === "admin"} />
          </div>
        </Section>

        {/* Role */}
        <Section icon={<Shield size={15} />} title="Role">
          <form action={setUserRole} className="flex gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <select name="role" defaultValue={user.role} className={inputCls}>
              <option value="player">Player</option>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" variant="ghost" className="shrink-0">Set role</Button>
          </form>
        </Section>

        {/* Balance adjustment */}
        <Section icon={<Coins size={15} />} title="Adjust balance">
          <form action={adminAdjustBalance} className="space-y-2">
            <input type="hidden" name="userId" value={user.id} />
            <input name="amount" type="number" step="0.01" placeholder="e.g. 100 or -50" className={inputCls} required />
            <input name="note" placeholder="Reason (optional)" className={inputCls} />
            <Button type="submit" variant="gold" className="w-full">Apply adjustment</Button>
            <p className="text-[11px] text-ink-500">Positive credits, negative debits the balance.</p>
          </form>
        </Section>
      </div>
    </div>
  );
}

function ActionBtn({ action, label, tone, disabled }: { action: () => Promise<void>; label: string; tone: "emerald" | "neutral" | "danger"; disabled?: boolean }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-glow/15 text-emerald-soft hover:bg-emerald-glow/25"
      : tone === "danger"
        ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25"
        : "bg-white/5 text-ink-200 hover:bg-white/10";
  return (
    <form action={action}>
      <button disabled={disabled} className={`w-full rounded-lg px-2 py-2 text-xs font-medium ring-1 ring-inset ring-white/10 transition disabled:opacity-30 ${cls}`}>
        {label}
      </button>
    </form>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium capitalize text-ink-200">
        <span className="text-emerald-soft">{icon}</span>{title}
      </p>
      {children}
    </div>
  );
}
