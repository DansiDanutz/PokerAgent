import { redirect } from "next/navigation";
import { Check, X, Users, ShieldCheck, Banknote, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { CLUB, clubIdConfigured } from "@/lib/clubgg";
import { formatPercent } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, Avatar } from "@/components/ui";
import { approveTransaction, setKyc, decideAgentRequest, decideAgentCredit } from "@/app/actions";
import { UserPlus } from "lucide-react";
import { TX_META } from "@/components/wallet/txMeta";
import { AdminUserManager, type AdminUserRow } from "@/components/admin/AdminUserManager";
import { RosterTools } from "@/components/admin/RosterTools";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const repo = getRepository();
  const [overview, pending, users, agentRequests, creditRequests, settlements] = await Promise.all([
    repo.getAdminOverview(),
    repo.listPendingTransactions(),
    repo.listUsers(),
    repo.listAgentRequests(),
    repo.listAgentCreditRequests(),
    repo.listSettlements(),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const settlementHistory = settlements.filter((t) => t.status !== "pending");
  const kycQueue = users.filter((u) => u.kycStatus === "pending");
  const adminRows: AdminUserRow[] = users.map((u) => {
    const upline = u.uplineAgentId ? userById.get(u.uplineAgentId) : undefined;
    return {
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      role: u.role,
      kycStatus: u.kycStatus,
      status: u.status,
      balance: u.balance,
      currency: u.currency,
      rake: u.stats.rakeGenerated,
      clubggId: u.clubggId,
      uplineAgentId: u.uplineAgentId,
      // Resolve the upline to its invite code + username so the export is
      // both human-readable and re-importable (the importer links members
      // by the agent's invite code, not by internal id).
      uplineReferralCode: upline?.referralCode,
      uplineUsername: upline?.username,
    };
  });

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
          subtitle="Deposits awaiting review"
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
                <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-100">{meta.label} · <span className="text-ink-400">{tx.userId}</span></p>
                    <p className="truncate text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <div className="ml-12 flex shrink-0 gap-2 sm:ml-0">
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

      {/* KYC review queue */}
      <Card>
        <SectionTitle
          title="KYC review queue"
          subtitle="Verify members to unlock Level 1+"
          action={<Badge tone={kycQueue.length ? "warning" : "emerald"}>{kycQueue.length} pending</Badge>}
        />
        {kycQueue.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No KYC submissions waiting. 🎉</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {kycQueue.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <Avatar name={u.fullName} src={u.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">{u.fullName}</p>
                  <p className="truncate text-xs text-ink-500">@{u.username}{u.clubggId ? ` · ClubGG ${u.clubggId}` : ""}</p>
                </div>
                <div className="ml-12 flex shrink-0 gap-2 sm:ml-0">
                  <form action={setKyc.bind(null, u.id, "verified")}>
                    <button className="flex items-center gap-1 rounded-lg bg-emerald-glow/15 px-3 py-1.5 text-xs font-medium text-emerald-soft hover:bg-emerald-glow/25">
                      <Check size={14} /> Verify
                    </button>
                  </form>
                  <form action={setKyc.bind(null, u.id, "rejected")}>
                    <button className="flex items-center gap-1 rounded-lg bg-[var(--color-danger)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25">
                      <X size={14} /> Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Agent promotion requests */}
      <Card>
        <SectionTitle
          title="Agent requests"
          subtitle="Players asking to become agents — only you can approve"
          action={<Badge tone={agentRequests.length ? "warning" : "emerald"}>{agentRequests.length} pending</Badge>}
        />
        {agentRequests.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No agent requests right now.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {agentRequests.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15">
                  <UserPlus size={16} className="text-gold-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">{u.fullName}</p>
                  <p className="truncate text-xs text-ink-500">
                    @{u.username} · {u.stats.handsPlayed.toLocaleString()} hands · {u.stats.tableHours}h
                  </p>
                </div>
                <div className="ml-12 flex shrink-0 gap-2 sm:ml-0">
                  <form action={decideAgentRequest.bind(null, u.id, "approved")}>
                    <button className="flex items-center gap-1 rounded-lg bg-emerald-glow/15 px-3 py-1.5 text-xs font-medium text-emerald-soft hover:bg-emerald-glow/25">
                      <Check size={14} /> Approve
                    </button>
                  </form>
                  <form action={decideAgentRequest.bind(null, u.id, "rejected")}>
                    <button className="flex items-center gap-1 rounded-lg bg-[var(--color-danger)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25">
                      <X size={14} /> Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Agent credit settlement */}
      <Card>
        <SectionTitle
          title="Settlement"
          subtitle="Agent credit requests — approved amounts are added to the agent's balance"
          action={<Badge tone={creditRequests.length ? "warning" : "emerald"}>{creditRequests.length} pending</Badge>}
        />
        {creditRequests.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No credit requests right now.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {creditRequests.map((tx) => {
              const agent = userById.get(tx.userId);
              return (
                <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15">
                    <Banknote size={16} className="text-gold-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-100">{agent?.fullName ?? tx.userId}</p>
                    <p className="truncate text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gold-300">{formatMoney(tx.amount, tx.currency)}</p>
                  <div className="ml-12 flex shrink-0 gap-2 sm:ml-0">
                    <form action={decideAgentCredit.bind(null, tx.id, "approved")}>
                      <button className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-glow/15 text-emerald-soft hover:bg-emerald-glow/25" aria-label="Approve">
                        <Check size={16} />
                      </button>
                    </form>
                    <form action={decideAgentCredit.bind(null, tx.id, "rejected")}>
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
        {settlementHistory.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-ink-400 hover:text-ink-200">
              Settlement history ({settlementHistory.length})
            </summary>
            <ul className="mt-2 divide-y divide-white/5">
              {settlementHistory.map((tx) => {
                const agent = userById.get(tx.userId);
                return (
                  <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-100">{agent?.fullName ?? tx.userId}</p>
                      <p className="truncate text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                    </div>
                    <Badge tone={tx.status === "completed" ? "emerald" : "danger"}>{tx.status}</Badge>
                    <p className="shrink-0 text-sm font-semibold text-gold-300">{formatMoney(tx.amount, tx.currency)}</p>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </Card>

      <RosterTools users={adminRows} />

      <AdminUserManager users={adminRows} />
    </div>
  );
}
