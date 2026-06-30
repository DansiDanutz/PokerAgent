import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, SendHorizontal, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { Card, Stat, SectionTitle, Badge, Avatar } from "@/components/ui";
import { BankrollChart } from "@/components/charts/BankrollChart";
import { InviteCard } from "@/components/InviteCard";
import { bankrollSeries } from "@/lib/series";
import { formatMoney, formatMoneyCompact, formatNumber, formatDate } from "@/lib/format";
import { TX_META } from "@/components/wallet/txMeta";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const repo = getRepository();
  const [transactions, summary, overview] = await Promise.all([
    repo.listTransactions(user.id),
    user.role !== "player" ? repo.getNetworkSummary(user.id) : Promise.resolve(null),
    user.role === "admin" ? repo.getAdminOverview() : Promise.resolve(null),
  ]);

  const recent = transactions.slice(0, 5);
  const series = bankrollSeries(user.stats.netProfit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">
          Hello, {user.fullName.split(" ")[0]} <span className="text-gold-300">👋</span>
        </h1>
        <p className="text-sm text-ink-400 capitalize">
          {user.role} dashboard · {user.country}
        </p>
      </div>

      {/* Balance + quick actions */}
      <Card glow="gold">
        <p className="text-xs uppercase tracking-wide text-ink-400">Your balance</p>
        <p className="mt-1 text-4xl font-semibold gold-text">
          {formatMoney(user.balance, user.currency)}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <QuickAction href="/wallet" icon={<ArrowDownToLine size={18} />} label="Deposit" />
          <QuickAction href="/wallet" icon={<ArrowUpFromLine size={18} />} label="Withdraw" />
          <QuickAction href="/wallet" icon={<SendHorizontal size={18} />} label="Transfer" />
        </div>
      </Card>

      {/* Admin overview band */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total users" value={formatNumber(overview.totalUsers)} />
          <Stat label="Agents" value={formatNumber(overview.totalAgents)} tone="gold" />
          <Stat label="Pending KYC" value={formatNumber(overview.pendingKyc)} tone={overview.pendingKyc ? "down" : "default"} />
          <Stat label="Pending cash" value={formatNumber(overview.pendingTransactions)} tone={overview.pendingTransactions ? "down" : "default"} />
        </div>
      )}

      {/* Player/agent stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Hands played" value={formatNumber(user.stats.handsPlayed)} />
        <Stat
          label="Net profit"
          value={formatMoneyCompact(user.stats.netProfit, user.currency)}
          tone={user.stats.netProfit >= 0 ? "up" : "down"}
        />
        <Stat label="Win rate" value={`${user.stats.winRateBb100} bb/100`} tone={user.stats.winRateBb100 >= 0 ? "up" : "down"} />
        <Stat label="Sessions" value={formatNumber(user.stats.sessions)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Bankroll trend */}
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Bankroll trend"
            subtitle="Net result over the last 6 months"
            action={<Badge tone="emerald"><TrendingUp size={12} /> {user.stats.winRateBb100} bb/100</Badge>}
          />
          <BankrollChart data={series} />
        </Card>

        {/* Network summary (agent/admin) or invite (player) */}
        {summary ? (
          <Card>
            <SectionTitle title="Your network" subtitle="Downline at a glance" />
            <div className="space-y-3">
              <RowStat label="Direct referrals" value={formatNumber(summary.directReferrals)} />
              <RowStat label="Total network" value={formatNumber(summary.totalNetwork)} />
              <RowStat label="Active players" value={formatNumber(summary.activePlayers)} />
              <RowStat label="Network rake" value={formatMoney(summary.networkRake, summary.currency)} />
              <RowStat label="Commission earned" value={formatMoney(summary.commissionEarned, summary.currency)} gold />
            </div>
            <Link
              href="/network"
              className="mt-4 block rounded-xl bg-white/5 py-2.5 text-center text-sm font-medium text-emerald-soft ring-1 ring-inset ring-white/10 hover:bg-white/10"
            >
              View network tree
            </Link>
          </Card>
        ) : (
          <InviteCard code={user.referralCode} />
        )}
      </div>

      {/* Recent activity */}
      <Card>
        <SectionTitle
          title="Recent activity"
          action={<Link href="/wallet" className="text-sm text-emerald-soft hover:underline">View all</Link>}
        />
        <ul className="divide-y divide-white/5">
          {recent.map((tx) => {
            const meta = TX_META[tx.type];
            const Icon = meta.icon;
            return (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <div className={`grid h-9 w-9 place-items-center rounded-full ${meta.bg}`}>
                  <Icon size={16} className={meta.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100">{meta.label}</p>
                  <p className="text-xs text-ink-500">{formatDate(tx.createdAt)} · {tx.note ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <Badge tone={tx.status === "completed" ? "emerald" : tx.status === "pending" ? "warning" : "neutral"}>
                    {tx.status}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 py-3 text-xs font-medium text-ink-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-emerald-soft"
    >
      {icon}
      {label}
    </Link>
  );
}

function RowStat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-400">{label}</span>
      <span className={`text-sm font-semibold ${gold ? "gold-text" : "text-ink-100"}`}>{value}</span>
    </div>
  );
}
