import {
  BadgeCheck,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Trophy,
  Bell,
  Lock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, Stat, SectionTitle, Badge, Avatar, ProgressBar } from "@/components/ui";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type { KycStatus } from "@/types/domain";

const KYC_TONE: Record<KycStatus, string> = {
  verified: "emerald",
  pending: "warning",
  unverified: "neutral",
  rejected: "danger",
};

export default async function ProfilePage() {
  const user = (await getCurrentUser())!;
  // Illustrative achievements derived from stats.
  const achievements = [
    { label: "Hands milestone", value: Math.min(1, user.stats.handsPlayed / 50000), hint: `${formatNumber(user.stats.handsPlayed)} / 50,000` },
    { label: "Profit goal", value: Math.max(0, Math.min(1, user.stats.netProfit / 1_000_000)), hint: formatMoney(user.stats.netProfit, user.currency) },
    { label: "Sessions", value: Math.min(1, user.stats.sessions / 500), hint: `${user.stats.sessions} / 500` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-100">Profile</h1>

      <Card glow="gold">
        <div className="flex items-center gap-4">
          <Avatar name={user.fullName} src={user.avatarUrl} size={72} ring />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-ink-100">{user.fullName}</h2>
              {user.kycStatus === "verified" && <BadgeCheck size={18} className="text-emerald-soft" />}
            </div>
            <p className="text-sm text-ink-400">@{user.username}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="gold" >{user.role}</Badge>
              <Badge tone={KYC_TONE[user.kycStatus]}>KYC: {user.kycStatus}</Badge>
              <Badge tone="neutral">Member since {formatDate(user.createdAt)}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Personal info" />
          <dl className="space-y-3 text-sm">
            <InfoRow icon={<Mail size={16} />} label="Email" value={user.email} />
            <InfoRow icon={<Phone size={16} />} label="Phone" value={user.phone ?? "—"} />
            <InfoRow icon={<MapPin size={16} />} label="Country" value={user.country ?? "—"} />
            <InfoRow icon={<ShieldCheck size={16} />} label="Referral code" value={user.referralCode} mono />
          </dl>
        </Card>

        <Card>
          <SectionTitle title="Stats & achievements" action={<Trophy size={16} className="text-gold-300" />} />
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Hands" value={formatNumber(user.stats.handsPlayed)} />
            <Stat label="Win rate" value={`${user.stats.winRateBb100}`} tone={user.stats.winRateBb100 >= 0 ? "up" : "down"} />
            <Stat label="Sessions" value={formatNumber(user.stats.sessions)} />
          </div>
          <div className="mt-4 space-y-3">
            {achievements.map((a) => (
              <div key={a.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-300">{a.label}</span>
                  <span className="text-ink-500">{a.hint}</span>
                </div>
                <ProgressBar value={a.value} tone={a.value >= 1 ? "gold" : "emerald"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Settings & security" />
        <div className="space-y-2">
          <SettingRow icon={<Lock size={16} />} label="Two-factor authentication" status="Enabled" tone="emerald" />
          <SettingRow icon={<Bell size={16} />} label="Push notifications" status="On" tone="emerald" />
          <SettingRow icon={<ShieldCheck size={16} />} label="Responsible play limits" status="Configured" tone="gold" />
        </div>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-ink-400">
        <span className="text-ink-500">{icon}</span>
        {label}
      </dt>
      <dd className={`text-ink-100 ${mono ? "font-mono tracking-wide" : ""}`}>{value}</dd>
    </div>
  );
}

function SettingRow({ icon, label, status, tone }: { icon: React.ReactNode; label: string; status: string; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-3 ring-1 ring-inset ring-white/5">
      <span className="flex items-center gap-3 text-sm text-ink-200">
        <span className="text-ink-500">{icon}</span>
        {label}
      </span>
      <Badge tone={tone}>{status}</Badge>
    </div>
  );
}
