import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui";
import { NetworkTree } from "@/components/network/NetworkTree";
import { TreeVisual } from "@/components/network/TreeVisual";
import { RakeBarChart } from "@/components/charts/RakeBarChart";
import { InviteCard } from "@/components/InviteCard";
import { flattenNetwork } from "@/lib/network";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

export default async function NetworkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const repo = getRepository();
  const [tree, summary] = await Promise.all([
    repo.getNetworkTree(user.id),
    repo.getNetworkSummary(user.id),
  ]);
  if (!tree) redirect("/dashboard");

  const players = flattenNetwork(tree).sort(
    (a, b) => b.user.stats.rakeGenerated - a.user.stats.rakeGenerated,
  );
  const chartData = players.slice(0, 6).map((n) => ({
    label: n.user.username.slice(0, 8),
    value: Math.round(n.user.stats.rakeGenerated / 100),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Your network</h1>
        <p className="text-sm text-ink-400">Player stats from across your tree.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Direct referrals" value={formatNumber(summary.directReferrals)} />
        <Stat label="Total network" value={formatNumber(summary.totalNetwork)} tone="gold" />
        <Stat label="Active players" value={formatNumber(summary.activePlayers)} tone="up" />
        <Stat
          label="Commission"
          value={formatMoney(summary.commissionEarned, summary.currency)}
          hint={`${formatPercent(summary.commissionRate, 0)} of ${formatMoney(summary.networkRake, summary.currency)} rake`}
          tone="gold"
        />
      </div>

      <Card>
        <SectionTitle
          title="Your tree"
          subtitle="Tap an empty slot to invite someone via WhatsApp"
          action={<Badge tone="gold">{summary.directReferrals} direct</Badge>}
        />
        <TreeVisual
          rootName={user.fullName}
          rootAvatarUrl={user.avatarUrl}
          rootRole={user.role}
          children={tree.children}
          referralCode={user.referralCode}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Rake by player" subtitle="Top contributors in your network" />
          <RakeBarChart data={chartData} />
        </Card>
        <InviteCard code={user.referralCode} />
      </div>

      <Card>
        <SectionTitle
          title="Network tree"
          subtitle="Expand agents to see their downline"
          action={<Badge tone="emerald">{summary.totalNetwork} members</Badge>}
        />
        <NetworkTree root={tree} />
      </Card>

      <Card>
        <SectionTitle title="Player leaderboard" subtitle="Ranked by rake generated" />

        {/* Card list — phones & narrow tablets. */}
        <ul className="space-y-2 md:hidden">
          {players.map((n) => (
            <li key={n.user.id} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-ink-100">
                  {n.user.fullName}
                  {n.user.role === "agent" && <span className="ml-1.5 text-[11px] text-gold-300">agent</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold gold-text">{formatMoney(n.user.stats.rakeGenerated, n.user.currency)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {formatNumber(n.user.stats.handsPlayed)} hands ·{" "}
                <span className={n.user.stats.netProfit >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}>
                  {formatMoney(n.user.stats.netProfit, n.user.currency)}
                </span>{" "}
                net · {formatMoney(n.user.balance, n.user.currency)} bal
              </p>
            </li>
          ))}
        </ul>

        {/* Full table — tablet & desktop. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2 text-right">Hands</th>
                <th className="px-2 py-2 text-right">Net</th>
                <th className="px-2 py-2 text-right">Rake</th>
                <th className="px-2 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {players.map((n) => (
                <tr key={n.user.id} className="text-ink-200">
                  <td className="px-2 py-2.5">
                    <span className="font-medium text-ink-100">{n.user.fullName}</span>
                    {n.user.role === "agent" && <span className="ml-2 text-[11px] text-gold-300">agent</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">{formatNumber(n.user.stats.handsPlayed)}</td>
                  <td className={`px-2 py-2.5 text-right ${n.user.stats.netProfit >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                    {formatMoney(n.user.stats.netProfit, n.user.currency)}
                  </td>
                  <td className="px-2 py-2.5 text-right gold-text font-medium">
                    {formatMoney(n.user.stats.rakeGenerated, n.user.currency)}
                  </td>
                  <td className="px-2 py-2.5 text-right">{formatMoney(n.user.balance, n.user.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
