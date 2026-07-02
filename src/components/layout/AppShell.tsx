"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Wallet,
  Network,
  Users,
  Calculator,
  Megaphone,
  User as UserIcon,
  Bell,
  Shield,
  LineChart,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Role, User } from "@/types/domain";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/ui";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { formatMoney } from "@/lib/format";
import { logout } from "@/app/actions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["player", "agent", "admin"] },
  { href: "/network", label: "My Tree", icon: Network, roles: ["player", "agent", "admin"] },
  { href: "/members", label: "Members", icon: Users, roles: ["agent", "admin"] },
  { href: "/promote", label: "Promote", icon: Megaphone, roles: ["player", "agent"] },
  { href: "/wallet", label: "Wallet", icon: Wallet, roles: ["player", "agent", "admin"] },
  { href: "/calculator", label: "Calculator", icon: Calculator, roles: ["player", "agent", "admin"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["admin"] },
  { href: "/admin/economy", label: "Economy", icon: LineChart, roles: ["admin"] },
  { href: "/notifications", label: "Alerts", icon: Bell, roles: ["player", "agent", "admin"] },
  { href: "/profile", label: "Profile", icon: UserIcon, roles: ["player", "agent", "admin"] },
];

export function AppShell({
  user,
  unreadCount = 0,
  children,
}: {
  user: User;
  unreadCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.roles.includes(user.role));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 px-4 py-6 lg:flex">
        <Brand size="sm" href="/dashboard" />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href}
              badge={item.href === "/notifications" && unreadCount > 0 ? unreadCount : undefined}
            />
          ))}
        </nav>
        <RoleCard user={user} />
        <LogoutButton />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
        <TopBar user={user} unreadCount={unreadCount} />
        <InstallAppBanner />
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around overflow-hidden border-t border-white/10 bg-felt-900/95 px-1 py-2 backdrop-blur lg:hidden">
        {items.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          const showDot = item.href === "/notifications" && unreadCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1 text-[10px]",
                active ? "text-emerald-soft" : "text-ink-500",
              )}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {showDot && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-ember-400 ring-2 ring-felt-900" />
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-emerald-glow/12 text-emerald-soft ring-1 ring-inset ring-emerald-glow/25"
          : "text-ink-300 hover:bg-white/5",
      )}
    >
      <Icon size={18} />
      <span className="flex-1">{item.label}</span>
      {!!badge && (
        <span className="rounded-full bg-ember-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-ember-300">
          {badge}
        </span>
      )}
    </Link>
  );
}

function RoleCard({ user }: { user: User }) {
  return (
    <div className="card-surface mb-3 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.fullName} src={user.avatarUrl} size={36} ring />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-100">{user.fullName}</p>
          <p className="text-xs capitalize text-gold-300">{user.role}</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ user, unreadCount }: { user: User; unreadCount: number }) {
  // An admin account doesn't hold poker chips, so a balance pill is noise —
  // show their role instead, consistently on desktop and mobile.
  const isAdmin = user.role === "admin";
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-felt-950/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="lg:hidden">
        <Brand size="sm" href="/dashboard" />
      </div>
      <div className="hidden lg:block">
        {isAdmin ? (
          <p className="text-sm font-semibold text-emerald-soft">Platform Admin</p>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-ink-500">Available balance</p>
            <p className="text-lg font-semibold gold-text">{formatMoney(user.balance, user.currency)}</p>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-ink-300 ring-1 ring-inset ring-white/10 lg:hidden">
          {isAdmin ? "Admin" : formatMoney(user.balance, user.currency)}
        </div>
        <Link
          href="/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full bg-white/5 text-ink-300 ring-1 ring-inset ring-white/10 hover:text-emerald-soft"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ember-500 px-1 text-[9px] font-bold text-felt-950 ring-2 ring-felt-950">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <Link href="/profile" aria-label="Profile">
          <Avatar name={user.fullName} src={user.avatarUrl} size={36} ring />
        </Link>
      </div>
    </header>
  );
}

function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-400 transition hover:bg-white/5 hover:text-[var(--color-danger)]"
      >
        <LogOut size={18} />
        Log out
      </button>
    </form>
  );
}
