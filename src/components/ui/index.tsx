import { clsx } from "clsx";
import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function Card({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: "gold" | "emerald" | "ember";
}) {
  return (
    <div
      className={clsx(
        "card-surface p-5",
        glow === "gold" && "gold-ring",
        glow === "emerald" && "emerald-glow",
        glow === "ember" && "ember-glow",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] pb-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm leading-snug text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "up" | "down" | "gold" | "ember";
}) {
  return (
    <div className="card-surface p-4">
      {/* min-h keeps the value baseline aligned across a row even when one
          tile's label wraps to two lines and a neighbor's doesn't. */}
      <p className="min-h-[2rem] text-[11px] font-medium uppercase leading-4 tracking-wider text-ink-400">{label}</p>
      <p
        className={clsx(
          "mt-1 font-display text-xl font-semibold tabular-nums",
          tone === "up" && "text-emerald-soft",
          tone === "down" && "text-[var(--color-danger)]",
          tone === "gold" && "gold-text",
          tone === "ember" && "ember-text",
          tone === "default" && "text-ink-100",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  emerald: "bg-emerald-glow/15 text-emerald-soft ring-emerald-glow/30",
  gold: "bg-gold-500/15 text-gold-300 ring-gold-500/30",
  ember: "bg-ember-500/15 text-ember-300 ring-ember-500/35",
  neutral: "bg-white/5 text-ink-300 ring-white/10",
  danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)] ring-[var(--color-danger)]/30",
  warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] ring-[var(--color-warning)]/30",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones | string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeTones[tone] ?? badgeTones.neutral,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 40,
  ring,
}: {
  name: string;
  src?: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <div
      className={clsx(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-felt-700 font-semibold text-gold-300",
        ring && "gold-ring",
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </div>
  );
}

export function ProgressBar({ value, tone = "emerald" }: { value: number; tone?: "emerald" | "gold" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={clsx(
          "h-full rounded-full",
          tone === "emerald" ? "bg-emerald-glow" : "bg-gold-500",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "gold" | "ember";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "bg-white/5 text-ink-100 hover:bg-white/10 ring-1 ring-inset ring-white/10",
        variant === "gold" &&
          "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241c05] font-semibold hover:brightness-105",
        variant === "ember" && "btn-ember",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-400">
      {children}
    </div>
  );
}
