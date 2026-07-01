import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export interface DashboardCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Headline metric shown large (e.g. balance, member count). */
  metric?: string;
  /** Small label under the metric. */
  metricLabel?: string;
  tone?: "emerald" | "gold" | "ember" | "neutral";
  badge?: string;
}

const toneMap = {
  emerald: { tile: "bg-emerald-glow/15 text-emerald-soft", glow: "hover:emerald-glow" },
  gold: { tile: "bg-gold-500/15 text-gold-300", glow: "hover:gold-ring" },
  ember: { tile: "bg-ember-500/15 text-ember-300", glow: "hover:ember-glow" },
  neutral: { tile: "bg-white/8 text-ink-200", glow: "" },
};

/** A large, tappable dashboard tile that routes into its section. */
export function DashboardCard({
  href,
  title,
  description,
  icon: Icon,
  metric,
  metricLabel,
  tone = "neutral",
  badge,
}: DashboardCardProps) {
  const t = toneMap[tone];
  return (
    <Link
      href={href}
      className={clsx(
        "card-surface group relative flex min-h-[150px] flex-col justify-between p-5 transition",
        "hover:-translate-y-0.5 hover:border-white/15",
        tone === "gold" && "hover:gold-ring",
        tone === "emerald" && "hover:emerald-glow",
        tone === "ember" && "hover:ember-glow",
      )}
    >
      <div className="flex items-start justify-between">
        <div className={clsx("grid h-11 w-11 place-items-center rounded-xl", t.tile)}>
          <Icon size={22} />
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-ink-400 transition group-hover:bg-white/10 group-hover:text-ink-100">
          <ArrowUpRight size={16} />
        </span>
      </div>

      <div>
        {metric && (
          <p
            className={clsx(
              "font-display text-2xl font-semibold",
              tone === "gold" ? "gold-text" : tone === "ember" ? "ember-text" : "text-ink-100",
            )}
          >
            {metric}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-base font-semibold text-ink-100">{title}</h3>
          {badge && (
            <span className="rounded-full bg-ember-500/15 px-2 py-0.5 text-[10px] font-semibold text-ember-300 ring-1 ring-inset ring-ember-500/30">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-400">{metricLabel ?? description}</p>
      </div>
    </Link>
  );
}
