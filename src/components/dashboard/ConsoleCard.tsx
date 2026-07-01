import Link from "next/link";
import { ArrowUpRight, Lock, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { ProgressBar } from "@/components/ui";

type Tone = "emerald" | "gold" | "ember";

/**
 * A "console tier" tile for the layered role model. Unlike a plain
 * DashboardCard, a console is a *destination the account grows into*, so it is
 * always shown — but rendered in one of three states:
 *
 *  - `locked`  the requirement isn't met yet. Dimmed, lock badge, live progress
 *              toward the unlock threshold, and the exact requirement spelled
 *              out. Not navigable — you can't enter a tier you haven't earned.
 *  - `ready`   requirements are met but the tier isn't active yet (e.g. a player
 *              eligible to request agent status). Highlighted, with an inline
 *              call-to-action instead of a route.
 *  - `open`    the tier is active for this account. Behaves like a normal tile:
 *              routes into its workspace and shows a live metric.
 */
export interface ConsoleCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  tone?: Tone;
  state: "locked" | "ready" | "open";
  /** Progress toward the unlock threshold — shown in the `locked` state. */
  progress?: { current: number; target: number; unit: string };
  /** One-line unlock requirement — shown in the `locked` state. */
  requirement?: string;
  /** Route entered in the `open` state. */
  href?: string;
  /** Headline metric shown large in the `open` state. */
  metric?: string;
  metricLabel?: string;
  /** Inline call-to-action rendered in the `ready` state (e.g. a request form). */
  cta?: ReactNode;
}

const TONE: Record<Tone, { tile: string; ring: string; bar: "emerald" | "gold" }> = {
  emerald: { tile: "bg-emerald-glow/15 text-emerald-soft", ring: "hover:emerald-glow", bar: "emerald" },
  gold: { tile: "bg-gold-500/15 text-gold-300", ring: "hover:gold-ring", bar: "gold" },
  ember: { tile: "bg-ember-500/15 text-ember-300", ring: "hover:ember-glow", bar: "gold" },
};

const SHELL = "card-surface group relative flex min-h-[150px] flex-col justify-between p-5";

export function ConsoleCard(props: ConsoleCardProps) {
  const { title, description, icon: Icon, tone = "gold", state } = props;
  const t = TONE[tone];

  // LOCKED — a tier you can see but haven't earned. No navigation.
  if (state === "locked") {
    const pct = props.progress ? Math.min(1, props.progress.current / props.progress.target) : 0;
    return (
      <div className={clsx(SHELL, "border-white/5")}>
        <div className="flex items-start justify-between">
          <div className="relative">
            <div className={clsx("grid h-11 w-11 place-items-center rounded-xl opacity-40 grayscale", t.tile)}>
              <Icon size={22} />
            </div>
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-felt-900 text-ink-300 ring-1 ring-inset ring-white/15">
              <Lock size={12} />
            </span>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400 ring-1 ring-inset ring-white/10">
            Locked
          </span>
        </div>

        <div>
          <h3 className="text-base font-semibold text-ink-200">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{props.requirement ?? description}</p>
          {props.progress && (
            <div className="mt-3">
              <ProgressBar value={pct} tone={t.bar} />
              <p className="mt-1.5 text-right text-[11px] font-medium text-ink-400">
                {props.progress.current} / {props.progress.target} {props.progress.unit}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // READY — earned but not yet active. Highlighted, CTA instead of a route.
  if (state === "ready") {
    return (
      <div className={clsx(SHELL, "gold-ring")}>
        <div className="flex items-start justify-between">
          <div className={clsx("grid h-11 w-11 place-items-center rounded-xl", t.tile)}>
            <Icon size={22} />
          </div>
          <span className="flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-300 ring-1 ring-inset ring-gold-500/30">
            <Sparkles size={11} /> Eligible
          </span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink-100">{title}</h3>
          <p className="mt-0.5 mb-3 text-xs text-ink-400">{description}</p>
          {props.cta}
        </div>
      </div>
    );
  }

  // OPEN — active tier. A normal, navigable launcher tile.
  return (
    <Link href={props.href ?? "#"} className={clsx(SHELL, "transition hover:-translate-y-0.5 hover:border-white/15", t.ring)}>
      <div className="flex items-start justify-between">
        <div className={clsx("grid h-11 w-11 place-items-center rounded-xl", t.tile)}>
          <Icon size={22} />
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-ink-400 transition group-hover:bg-white/10 group-hover:text-ink-100">
          <ArrowUpRight size={16} />
        </span>
      </div>
      <div>
        {props.metric && (
          <p className={clsx("font-display text-2xl font-semibold", tone === "gold" ? "gold-text" : "text-ink-100")}>
            {props.metric}
          </p>
        )}
        <h3 className="mt-1 text-base font-semibold text-ink-100">{title}</h3>
        <p className="mt-0.5 text-xs text-ink-400">{props.metricLabel ?? description}</p>
      </div>
    </Link>
  );
}
