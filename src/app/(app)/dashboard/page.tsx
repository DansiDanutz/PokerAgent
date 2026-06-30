import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  SendHorizontal,
  Wallet as WalletIcon,
  Network as NetworkIcon,
  Users as UsersIcon,
  Calculator as CalcIcon,
  User as UserIcon,
  Bell,
  Shield,
  Megaphone,
  Target,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { Card, Badge } from "@/components/ui";
import { DashboardCard, type DashboardCardProps } from "@/components/dashboard/DashboardCard";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { ClubCard } from "@/components/clubgg/ClubCard";
import { InviteCard } from "@/components/InviteCard";
import {
  currentLevel,
  nextLevel,
  memberStatus,
  agentProgress,
  LEVELS,
} from "@/lib/levels";
import { requestAgentStatus } from "@/app/actions";
import type { NetworkNode } from "@/types/domain";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";

function nodeLevelInputs(node: NetworkNode) {
  return {
    kycVerified: node.user.kycStatus === "verified",
    tableHours: node.user.stats.tableHours,
    directReferrals: node.children.length,
  };
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const repo = getRepository();
  const [tree, notifications, overview] = await Promise.all([
    repo.getNetworkTree(user.id),
    repo.listNotifications(user.id),
    user.role === "admin" ? repo.getAdminOverview() : Promise.resolve(null),
  ]);

  const directReferrals = tree?.children.length ?? 0;
  const totalNetwork = tree?.subtreeSize ?? 0;
  const vipReferrals =
    tree?.children.filter((c) => memberStatus(nodeLevelInputs(c)) === "vip_player").length ?? 0;
  const unread = notifications.filter((n) => !n.read).length;

  const myInputs = {
    kycVerified: user.kycStatus === "verified",
    tableHours: user.stats.tableHours,
    directReferrals,
  };
  const level = currentLevel(myInputs);
  const next = nextLevel(myInputs);
  const progress = agentProgress({ level: level.level, directReferrals, vipReferrals });

  // Role-aware big cards. For non-players, "Network" highlights direct
  // referrals (who they personally brought in) while "Manage Members" below
  // shows the total downline — distinct numbers instead of a duplicate count.
  const networkMetric = user.role === "player" ? totalNetwork : directReferrals;
  const networkLabel =
    user.role === "player"
      ? totalNetwork === 1
        ? "member in your tree"
        : "members in your tree"
      : directReferrals === 1
        ? "direct referral"
        : "direct referrals";

  const cards: DashboardCardProps[] = [
    {
      href: "/network",
      title: user.role === "player" ? "My Tree" : "Network",
      description: "Your members & downline",
      icon: NetworkIcon,
      metric: formatNumber(networkMetric),
      metricLabel: networkLabel,
      tone: "emerald",
    },
    {
      href: "/wallet",
      title: "Wallet",
      description: "Deposit, withdraw, transfer",
      icon: WalletIcon,
      metric: formatMoneyCompact(user.balance, user.currency),
      metricLabel: "tap to manage your balance",
      tone: "gold",
    },
    {
      href: "/calculator",
      title: "Odds Calculator",
      description: "Equity, outs & pot odds",
      icon: CalcIcon,
      metric: "Hold'em · Omaha",
      metricLabel: "run the odds for any hand",
      tone: "neutral",
    },
    {
      href: "/profile",
      title: "Profile & Stats",
      description: "KYC, stats & settings",
      icon: UserIcon,
      // Levels track a player's climb toward agent status — once you ARE an
      // agent/admin that ladder is no longer the relevant headline.
      metric: user.role === "player" ? level.name : user.role === "agent" ? "Agent" : "Admin",
      metricLabel:
        user.role === "player" ? `Level ${level.level} · ${user.kycStatus}` : `${user.kycStatus} · view profile`,
      tone: "neutral",
    },
    {
      href: "/notifications",
      title: "Notifications",
      description: "Alerts & updates",
      icon: Bell,
      metric: unread > 0 ? `${unread} new` : "All read",
      metricLabel: "referrals, money & security",
      tone: "neutral",
      badge: unread > 0 ? String(unread) : undefined,
    },
  ];
  if (user.role !== "player") {
    cards.splice(1, 0, {
      href: "/members",
      title: "Manage Members",
      description: "Chips, hours, approvals",
      icon: UsersIcon,
      metric: formatNumber(totalNetwork),
      metricLabel: "members to manage",
      tone: "gold",
    });
  }
  if (user.role !== "admin") {
    cards.push({
      href: "/promote",
      title: "Promote & Grow",
      description: "Recruit members into your tree",
      icon: Megaphone,
      metric: "Share & invite",
      metricLabel: "links, posts, QR & banner",
      tone: "emerald",
    });
  }
  if (user.role === "admin") {
    cards.push({
      href: "/admin",
      title: "Admin Console",
      description: "Approvals & management",
      icon: Shield,
      metric: overview ? formatNumber(overview.pendingTransactions) : "0",
      metricLabel: "pending approvals",
      tone: "gold",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-100">
            Hello, {user.fullName.split(" ")[0]} <span className="text-gold-300">👋</span>
          </h1>
          <p className="text-sm text-ink-400 capitalize">{user.role} · {user.country}</p>
        </div>
        {/* Player levels (New/Player/VIP) track progress toward becoming an
            agent — once someone already holds a staff role, show that
            instead of a now-meaningless player-progression badge. */}
        {user.role === "player" ? (
          <MemberStatusBadge status={memberStatus(myInputs)} level={level.level} />
        ) : (
          <Badge tone={user.role === "admin" ? "emerald" : "gold"}>
            {user.role === "admin" ? "Admin" : "Agent"}
          </Badge>
        )}
      </div>

      {/* Balance hero */}
      <Card glow="gold">
        <p className="text-xs uppercase tracking-wide text-ink-400">Your balance</p>
        <p className="mt-1 text-4xl font-semibold gold-text">{formatMoney(user.balance, user.currency)}</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <QuickAction href="/wallet" icon={<ArrowDownToLine size={18} />} label="Deposit" />
          <QuickAction href="/wallet" icon={<ArrowUpFromLine size={18} />} label="Withdraw" />
          <QuickAction href="/wallet" icon={<SendHorizontal size={18} />} label="Transfer" />
        </div>
      </Card>

      {/* Path to Agent (players only) */}
      {user.role === "player" && (
        <Card glow="emerald">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-emerald-soft" />
              <h2 className="text-base font-semibold text-ink-100">Path to Agent</h2>
            </div>
            {user.agentRequest === "pending" ? (
              <span className="rounded-full bg-[var(--color-warning)]/15 px-3 py-1 text-xs font-medium text-[var(--color-warning)]">
                Request pending — awaiting admin approval
              </span>
            ) : progress.eligible ? (
              <form action={requestAgentStatus}>
                <button className="rounded-full bg-emerald-glow/15 px-3 py-1 text-xs font-medium text-emerald-soft hover:bg-emerald-glow/25">
                  {user.agentRequest === "rejected" ? "Request again" : "Request agent status 🎉"}
                </button>
              </form>
            ) : (
              <span className="text-xs text-ink-400">{progress.completed}/{progress.items.length} targets met</span>
            )}
          </div>

          {/* Level ladder */}
          <div className="mb-4 flex items-center gap-1">
            {LEVELS.map((l) => (
              <div key={l.level} className="flex-1">
                <div
                  className={`h-1.5 rounded-full ${l.level <= level.level ? "bg-emerald-glow" : "bg-white/10"}`}
                  title={l.name}
                />
                <p className={`mt-1 text-[10px] ${l.level === level.level ? "text-emerald-soft" : "text-ink-500"}`}>
                  L{l.level}
                </p>
              </div>
            ))}
          </div>
          {next && (
            <p className="mb-4 text-xs text-ink-400">
              Next: <span className="text-ink-200">{next.name}</span> — {nextHint(next.level)}
            </p>
          )}

          <ul className="space-y-2">
            {progress.items.map((item) => (
              <li key={item.key} className="flex items-center gap-3">
                {item.done ? (
                  <CheckCircle2 size={18} className="text-emerald-soft" />
                ) : (
                  <Circle size={18} className="text-ink-500" />
                )}
                <span className={`flex-1 text-sm ${item.done ? "text-ink-200" : "text-ink-400"}`}>{item.label}</span>
                <span className="text-xs font-medium text-ink-300">
                  {Math.min(item.current, item.target)}/{item.target}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Big card launcher */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <DashboardCard key={c.href + c.title} {...c} />
        ))}
      </div>

      {/* Club + invite */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ClubCard />
        <InviteCard code={user.referralCode} />
      </div>
    </div>
  );
}

function nextHint(levelNumber: number): string {
  const l = LEVELS.find((x) => x.level === levelNumber);
  if (!l) return "";
  const parts: string[] = [];
  if (l.requires.kyc) parts.push("verify KYC");
  if (l.requires.minTableHours) parts.push(`play ${l.requires.minTableHours}h`);
  if (l.requires.minDirectReferrals) parts.push(`refer ${l.requires.minDirectReferrals}`);
  return parts.join(" · ") || l.perk;
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
