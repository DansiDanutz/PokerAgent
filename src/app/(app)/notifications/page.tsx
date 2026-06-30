import { Users, DollarSign, Megaphone, ShieldAlert, Info } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { Card, SectionTitle, Badge } from "@/components/ui";
import { readNotification } from "@/app/actions";
import { formatDate } from "@/lib/format";
import type { NotificationKind } from "@/types/domain";

const KIND_META: Record<NotificationKind, { icon: typeof Users; color: string; bg: string }> = {
  referral: { icon: Users, color: "text-emerald-soft", bg: "bg-emerald-glow/15" },
  money: { icon: DollarSign, color: "text-gold-300", bg: "bg-gold-500/15" },
  promotion: { icon: Megaphone, color: "text-emerald-soft", bg: "bg-emerald-glow/15" },
  security: { icon: ShieldAlert, color: "text-[var(--color-danger)]", bg: "bg-[var(--color-danger)]/15" },
  system: { icon: Info, color: "text-ink-300", bg: "bg-white/10" },
};

export default async function NotificationsPage() {
  const user = (await getCurrentUser())!;
  const notifications = await getRepository().listNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink-100">Notifications</h1>
        {unread > 0 && <Badge tone="emerald">{unread} unread</Badge>}
      </div>

      <Card>
        <SectionTitle title="Recent" />
        {notifications.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-400">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {notifications.map((n) => {
              const meta = KIND_META[n.kind];
              const Icon = meta.icon;
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-100">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-emerald-glow" />}
                    </div>
                    <p className="text-sm text-ink-400">{n.body}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{formatDate(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <form action={readNotification.bind(null, n.id)}>
                      <button className="text-xs text-emerald-soft hover:underline">Mark read</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
