import {
  LEVELS,
  REFERRAL_RAKEBACK_TIERS,
  AGENT_RAKEBACK_TIERS,
  AGENT_MIN_VIP_NETWORK,
  AGENT_MIN_MONTHLY_HOURS,
  VIP_TABLE_HOURS,
  type PlayerLevel,
} from "@/lib/levels";
import { formatPercent } from "@/lib/format";

/** Title used by every trigger that opens this guide, so they stay consistent. */
export const LEVELS_GUIDE_TITLE = "Levels, agent status & rakeback";

function requirementText(level: PlayerLevel): string {
  const parts: string[] = [];
  if (level.requires.kyc) parts.push("KYC verified");
  if (level.requires.minTableHours) parts.push(`${level.requires.minTableHours}+ table hours`);
  if (level.requires.minDirectReferrals) parts.push(`${level.requires.minDirectReferrals}+ direct referrals`);
  return parts.length ? parts.join(" · ") : "Sign up";
}

/**
 * The full player-level / agent-status / rakeback explainer, rendered inside a
 * Modal by any trigger (the "Path to Agent" info button, the dashboard level
 * badge, …). All figures are pulled directly from src/lib/levels.ts so this can
 * never drift out of sync with the thresholds enforced server-side.
 */
export function LevelsGuide() {
  return (
    <div className="space-y-5 text-sm text-ink-300">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Player levels
        </h4>
        <ul className="space-y-2">
          {LEVELS.map((l) => (
            <li
              key={l.level}
              className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] p-2.5"
            >
              <div>
                <p className="font-medium text-ink-100">
                  L{l.level} · {l.name}
                </p>
                <p className="text-xs text-ink-400">{requirementText(l)}</p>
              </div>
              <p className="shrink-0 text-right text-xs text-emerald-soft">{l.perk}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Becoming an agent
        </h4>
        <p>
          Anyone can refer friends and share their invite code. Growing your network to{" "}
          <span className="text-ink-100">{AGENT_MIN_VIP_NETWORK}+ VIP (Level 2+) players</span> — not
          counting yourself — unlocks requesting agent status. The admin reviews every request; agents
          can&apos;t self-promote or promote their own downline.
        </p>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Affiliate rakeback (players)
        </h4>
        <p className="mb-2 text-xs text-ink-400">
          Referral earnings unlock once you&apos;re VIP (Level 2 — KYC verified + {VIP_TABLE_HOURS}+ table
          hours). Your rate tracks your VIP network count live.
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REFERRAL_RAKEBACK_TIERS.map((t) => (
            <li key={t.minVip} className="rounded-lg bg-white/[0.03] p-2 text-center">
              <p className="gold-text font-semibold">{formatPercent(t.rate, 0)}</p>
              <p className="text-[11px] text-ink-500">{t.minVip}+ VIP</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Agent rakeback
        </h4>
        <p className="mb-2 text-xs text-ink-400">
          Locked once a month, based on VIP players in your own business (not counting a nested
          sub-agent&apos;s downline) who each played {AGENT_MIN_MONTHLY_HOURS}+ hours since the last
          recalculation.
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AGENT_RAKEBACK_TIERS.map((t) => (
            <li key={t.minVip} className="rounded-lg bg-white/[0.03] p-2 text-center">
              <p className="gold-text font-semibold">{formatPercent(t.rate, 0)}</p>
              <p className="text-[11px] text-ink-500">{t.minVip}+ VIP</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
