import { redirect } from "next/navigation";
import { Check, X, Users, Coins, AlertTriangle, Banknote } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { CLUB } from "@/lib/clubgg";
import { Card, Stat, SectionTitle, Badge, Button, Avatar } from "@/components/ui";
import { MemberManager, type MemberRow } from "@/components/members/MemberManager";
import { TX_META } from "@/components/wallet/txMeta";
import { decideMemberTransaction, requestAgentCredit } from "@/app/actions";
import { currentLevel, memberStatus, isRakebackEligible } from "@/lib/levels";
import { isDormant, daysSinceActive } from "@/lib/activity";
import { formatMoney, formatNumber, formatPercent, formatDate } from "@/lib/format";

export default async function MembersPage() {
  const user = (await getCurrentUser())!;
  if (user.role === "player") redirect("/dashboard");

  const repo = getRepository();
  const [downline, summary, allSettlements] = await Promise.all([
    repo.listDownline(user.id),
    repo.getNetworkSummary(user.id),
    user.role === "agent" ? repo.listSettlements() : Promise.resolve([]),
  ]);
  const mySettlements = allSettlements.filter((t) => t.userId === user.id);

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
      creditLimit: m.creditLimit ?? 0,
      isDirect: m.uplineAgentId === user.id,
      rakebackEligible: isRakebackEligible(inputs),
      isDormant: isDormant(m.lastActiveAt, new Date(), m.createdAt),
      inactiveDays: daysSinceActive(m.lastActiveAt, new Date(), m.createdAt),
    };
  });
  const notEarningRakeback = rows.filter((r) => !r.rakebackEligible);

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

      {summary.frozen && (
        <Card className="border border-[var(--color-danger)]/30">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-danger)]/15">
              <AlertTriangle size={16} className="text-[var(--color-danger)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-100">Your balance is negative</p>
              <p className="text-xs text-ink-400">
                Settle it to resume earning commission and requesting credit. Collect payments from
                your players, or ask the admin for credit once you&apos;re back above zero.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Earnings / commission */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={formatNumber(summary.totalNetwork)} />
        <Stat label="Active players" value={formatNumber(summary.activePlayers)} tone="up" />
        <Stat label="Network rake" value={formatMoney(summary.networkRake, summary.currency)} />
        <Stat label="Your commission" value={formatMoney(summary.commissionEarned, summary.currency)} tone="gold" />
      </div>

      {/* Agent → admin credit request */}
      {user.role === "agent" && (
        <Card>
          <SectionTitle
            title="Request credit from Admin"
            subtitle="Need more float to fund your players? Ask the admin — it's recorded in settlement."
          />
          <form action={requestAgentCredit} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">Amount (USD)</span>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="500.00"
                required
                disabled={summary.frozen}
                className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">Reason (optional)</span>
              <input
                name="note"
                placeholder="Need more float for the weekend"
                disabled={summary.frozen}
                className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50 disabled:opacity-50"
              />
            </label>
            <Button type="submit" variant="gold" disabled={summary.frozen}>
              Request credit
            </Button>
          </form>

          {mySettlements.length > 0 && (
            <ul className="mt-4 divide-y divide-white/5">
              {mySettlements.map((tx) => (
                <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-500/15">
                    <Banknote size={14} className="text-gold-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink-300">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <Badge tone={tx.status === "pending" ? "warning" : tx.status === "completed" ? "emerald" : "danger"}>
                    {tx.status}
                  </Badge>
                  <p className="shrink-0 text-sm font-semibold text-gold-300">{formatMoney(tx.amount, tx.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

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

      {/* Rakeback eligibility — who an agent needs to chase to start earning */}
      {user.role === "agent" && notEarningRakeback.length > 0 && (
        <Card glow="ember">
          <SectionTitle
            title="Rakeback status"
            subtitle="L0 players can play, but their rake doesn't count toward your commission until they verify KYC (Level 1)."
            action={<Badge tone="ember">{notEarningRakeback.length} not earning yet</Badge>}
          />
          <ul className="divide-y divide-white/5">
            {notEarningRakeback.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar name={m.fullName} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">{m.fullName}</p>
                  <p className="truncate text-xs text-ink-500">
                    @{m.username} · KYC {m.kycStatus} · {formatMoney(m.rake, m.currency)} rake on hold
                  </p>
                </div>
                <Badge tone="ember">L0</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">
            Nudge them to submit KYC, then ask the admin to verify it from their console.
          </p>
        </Card>
      )}

      {/* Pending requests */}
      <Card>
        <SectionTitle
          title="Pending requests"
          subtitle="Deposits awaiting review from your members"
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
                <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-100">{meta.label} · <span className="text-ink-400">{nameById.get(tx.userId)}</span></p>
                    <p className="truncate text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <div className="ml-12 flex shrink-0 gap-2 sm:ml-0">
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
        <MemberManager members={rows} agentBalance={user.balance} agentCurrency={user.currency} />
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
