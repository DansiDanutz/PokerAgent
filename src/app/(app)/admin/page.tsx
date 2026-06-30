import { redirect } from "next/navigation";
import { Check, X, Users, ShieldCheck, Banknote, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { CLUB, clubIdConfigured } from "@/lib/clubgg";
import { formatPercent } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, Avatar } from "@/components/ui";
import { approveTransaction } from "@/app/actions";
import { TX_META } from "@/components/wallet/txMeta";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type { KycStatus } from "@/types/domain";

const KYC_TONE: Record<KycStatus, string> = {
  verified: "emerald",
  pending: "warning",
  unverified: "neutral",
  rejected: "danger",
};

export default async function AdminPage() {
  const user = (await getCurrentUser())!;
  if (user.role !== "admin") redirect("/dashboard");

  const repo = getRepository();
  const [overview, pending, users] = await Promise.all([
    repo.getAdminOverview(),
    repo.listPendingTransactions(),
    repo.listUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Admin console</h1>
        <p className="text-sm text-ink-400">Oversee players, agents, KYC and cash flow.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={formatNumber(overview.totalUsers)} />
        <Stat label="Agents" value={formatNumber(overview.totalAgents)} tone="gold" />
        <Stat label="Players" value={formatNumber(overview.totalPlayers)} />
        <Stat label="Pending KYC" value={formatNumber(overview.pendingKyc)} tone={overview.pendingKyc ? "down" : "default"} />
        <Stat label="Total balance" value={formatMoney(overview.totalBalance, overview.currency)} tone="gold" />
        <Stat label="Platform rake" value={formatMoney(overview.platformRake, overview.currency)} tone="up" />
      </div>

      <Card glow="gold">
        <SectionTitle title="ClubGG club settings" subtitle="Where your players join — synced manually in the ClubGG agent panel" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Club ID" value={CLUB.clubId} tone="gold" hint={clubIdConfigured() ? "Live" : "Set NEXT_PUBLIC_CLUBGG_CLUB_ID"} />
          <Stat label="Club" value={CLUB.clubName} />
          <Stat label="Union" value={CLUB.unionName || "—"} />
          <Stat
            label="Rake split (U/C/A)"
            value={`${formatPercent(CLUB.rakeSplit.union, 0)} / ${formatPercent(CLUB.rakeSplit.club, 0)} / ${formatPercent(CLUB.rakeSplit.agent, 0)}`}
          />
        </div>
        {!clubIdConfigured() && (
          <p className="mt-3 text-xs text-[var(--color-warning)]">
            ⚠ Club ID is a placeholder. Set <span className="font-mono">NEXT_PUBLIC_CLUBGG_CLUB_ID</span> to your real ClubGG club number.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Pending approvals"
          subtitle="Deposits and withdrawals awaiting review"
          action={<Badge tone={pending.length ? "warning" : "emerald"}>{pending.length} pending</Badge>}
        />
        {pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">Nothing to review. 🎉</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {pending.map((tx) => {
              const meta = TX_META[tx.type];
              const Icon = meta.icon;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <div className={`grid h-9 w-9 place-items-center rounded-full ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-100">{meta.label} · <span className="text-ink-400">{tx.userId}</span></p>
                    <p className="text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <p className={`text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <div className="flex gap-2">
                    <form action={approveTransaction.bind(null, tx.id, "approved")}>
                      <button className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-glow/15 text-emerald-soft hover:bg-emerald-glow/25" aria-label="Approve">
                        <Check size={16} />
                      </button>
                    </form>
                    <form action={approveTransaction.bind(null, tx.id, "rejected")}>
                      <button className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25" aria-label="Reject">
                        <X size={16} />
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle title="User management" subtitle="All players, agents and admins" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">KYC</th>
                <th className="px-2 py-2">ClubGG ID</th>
                <th className="px-2 py-2">Upline</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2 text-right">Rake</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id} className="text-ink-200">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.fullName} src={u.avatarUrl} size={28} />
                      <div>
                        <p className="font-medium text-ink-100">{u.fullName}</p>
                        <p className="text-[11px] text-ink-500">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5"><Badge tone={u.role === "agent" ? "gold" : u.role === "admin" ? "emerald" : "neutral"}>{u.role}</Badge></td>
                  <td className="px-2 py-2.5"><Badge tone={KYC_TONE[u.kycStatus]}>{u.kycStatus}</Badge></td>
                  <td className="px-2 py-2.5 font-mono text-ink-300">{u.clubggId ?? "—"}</td>
                  <td className="px-2 py-2.5 text-ink-400">{u.uplineAgentId ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right">{formatMoney(u.balance, u.currency)}</td>
                  <td className="px-2 py-2.5 text-right gold-text font-medium">{formatMoney(u.stats.rakeGenerated, u.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
