import { redirect } from "next/navigation";
import { Check, X, Users, Coins } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { CLUB } from "@/lib/clubgg";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui";
import { MemberManager, type MemberRow } from "@/components/members/MemberManager";
import { TX_META } from "@/components/wallet/txMeta";
import { decideMemberTransaction } from "@/app/actions";
import { currentLevel, memberStatus } from "@/lib/levels";
import { formatMoney, formatNumber, formatPercent, formatDate } from "@/lib/format";

export default async function MembersPage() {
  const user = (await getCurrentUser())!;
  if (user.role === "player") redirect("/dashboard");

  const repo = getRepository();
  const [downline, summary] = await Promise.all([
    repo.listDownline(user.id),
    repo.getNetworkSummary(user.id),
  ]);

  // Build member rows with derived level/status.
  const rows: MemberRow[] = downline.map((m) => {
    const directReferrals = downline.filter((d) => d.uplineAgentId === m.id).length;
    const inputs = {
      kycVerified: m.kycStatus === "verified",
      tableHours: m.stats.tableHours,
      directReferrals,
    };
    return {
      id: m.id,
      fullName: m.fullName,
      username: m.username,
      role: m.role,
      kycStatus: m.kycStatus,
      balance: m.balance,
      currency: m.currency,
      tableHours: m.stats.tableHours,
      rake: m.stats.rakeGenerated,
      hands: m.stats.handsPlayed,
      level: currentLevel(inputs).level,
      status: memberStatus(inputs),
      clubggId: m.clubggId,
    };
  });

  // Pending requests across the downline.
  const txLists = await Promise.all(downline.map((m) => repo.listTransactions(m.id)));
  const nameById = new Map(downline.map((m) => [m.id, m.fullName]));
  const pending = txLists
    .flat()
    .filter((t) => t.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Members</h1>
        <p className="text-sm text-ink-400">Manage your players — chips, hours, approvals & promotions.</p>
      </div>

      {/* Earnings / commission */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={formatNumber(summary.totalNetwork)} />
        <Stat label="Active players" value={formatNumber(summary.activePlayers)} tone="up" />
        <Stat label="Network rake" value={formatMoney(summary.networkRake, summary.currency)} />
        <Stat label="Your commission" value={formatMoney(summary.commissionEarned, summary.currency)} tone="gold" />
      </div>

      {/* Rake chain */}
      <Card>
        <SectionTitle
          title="Rake chain"
          subtitle="How rake splits on ClubGG"
          action={<Badge tone="gold"><Coins size={12} /> {formatMoney(summary.networkRake, summary.currency)} network rake</Badge>}
        />
        <div className="grid grid-cols-3 gap-3">
          <RakeShare label="Union" pct={CLUB.rakeSplit.union} amount={summary.networkRake} currency={summary.currency} />
          <RakeShare label="Club" pct={CLUB.rakeSplit.club} amount={summary.networkRake} currency={summary.currency} />
          <RakeShare label="You (agent)" pct={CLUB.rakeSplit.agent} amount={summary.networkRake} currency={summary.currency} gold />
        </div>
      </Card>

      {/* Pending requests */}
      <Card>
        <SectionTitle
          title="Pending requests"
          subtitle="Deposits & withdrawals from your members"
          action={<Badge tone={pending.length ? "warning" : "emerald"}>{pending.length} pending</Badge>}
        />
        {pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No requests waiting. 🎉</p>
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
                    <p className="text-sm text-ink-100">{meta.label} · <span className="text-ink-400">{nameById.get(tx.userId)}</span></p>
                    <p className="text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <p className={`text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <div className="flex gap-2">
                    <form action={decideMemberTransaction.bind(null, tx.id, "approved")}>
                      <button className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-glow/15 text-emerald-soft hover:bg-emerald-glow/25" aria-label="Approve">
                        <Check size={16} />
                      </button>
                    </form>
                    <form action={decideMemberTransaction.bind(null, tx.id, "rejected")}>
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

      {/* Member manager */}
      {rows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users size={28} className="text-ink-500" />
            <p className="text-sm text-ink-300">No members yet.</p>
            <p className="text-xs text-ink-500">Share your invite from the Promote tab to grow your network.</p>
          </div>
        </Card>
      ) : (
        <MemberManager members={rows} />
      )}
    </div>
  );
}

function RakeShare({ label, pct, amount, currency, gold }: { label: string; pct: number; amount: number; currency: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 text-center ring-1 ring-inset ring-white/5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${gold ? "gold-text" : "text-ink-100"}`}>{formatPercent(pct, 0)}</p>
      <p className="text-[11px] text-ink-500">{formatMoney(Math.round(amount * pct), currency)}</p>
    </div>
  );
}
