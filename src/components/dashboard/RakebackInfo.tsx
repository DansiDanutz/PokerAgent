"use client";

import { useState } from "react";
import { Info, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  REFERRAL_RAKEBACK_TIERS,
  AGENT_MIN_VIP_NETWORK,
  VIP_TABLE_HOURS,
} from "@/lib/levels";
import { formatPercent } from "@/lib/format";

/**
 * Small "i" trigger next to the rakeback line that explains exactly how a
 * player's rakeback rate increases — the VIP-network tier ladder, how many
 * more VIP players unlock the next rate, and how a referral becomes VIP.
 * All figures come from src/lib/levels.ts so they can't drift from the real
 * thresholds.
 */
export function RakebackInfo({ vipNetworkCount }: { vipNetworkCount: number }) {
  const [open, setOpen] = useState(false);

  // Highest tier already reached, and the next one to aim for.
  const reachedRate = REFERRAL_RAKEBACK_TIERS.filter((t) => vipNetworkCount >= t.minVip).at(-1)?.rate ?? 0;
  const nextTier = REFERRAL_RAKEBACK_TIERS.find((t) => vipNetworkCount < t.minVip);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How your rakeback increases"
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-ink-500 ring-1 ring-inset ring-white/15 transition hover:bg-white/10 hover:text-ink-200"
      >
        <Info size={10} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="How your rakeback grows">
        <div className="space-y-4 text-sm text-ink-300">
          <p>
            Your rakeback rate is set by how many <span className="text-ink-100">VIP (Level 2+) players</span> are
            in your network. As that count grows, your rate steps up automatically:
          </p>

          <ul className="space-y-1.5">
            {REFERRAL_RAKEBACK_TIERS.map((t) => {
              const reached = vipNetworkCount >= t.minVip;
              const isNext = nextTier?.minVip === t.minVip;
              return (
                <li
                  key={t.minVip}
                  className={`flex items-center justify-between gap-3 rounded-lg p-2.5 ring-1 ring-inset ${
                    isNext
                      ? "bg-gold-500/10 ring-gold-500/30"
                      : reached
                        ? "bg-emerald-glow/10 ring-emerald-glow/20"
                        : "bg-white/[0.03] ring-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`font-semibold ${reached ? "gold-text" : "text-ink-200"}`}>
                      {formatPercent(t.rate, 0)}
                    </span>
                    <span className="text-xs text-ink-400">
                      {t.minVip}+ VIP player{t.minVip === 1 ? "" : "s"}
                    </span>
                  </span>
                  {reached ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-soft">
                      <Check size={12} /> Unlocked
                    </span>
                  ) : isNext ? (
                    <span className="text-[11px] font-medium text-gold-300">
                      {t.minVip - vipNetworkCount} more to go
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-ink-400">
            You&apos;re on <span className="gold-text font-semibold">{formatPercent(reachedRate, 0)}</span> with{" "}
            <span className="text-ink-200">{vipNetworkCount} VIP player{vipNetworkCount === 1 ? "" : "s"}</span> in
            your network.
            {nextTier
              ? ` Reach ${nextTier.minVip} to step up to ${formatPercent(nextTier.rate, 0)}.`
              : " You're at the top player tier — become an agent for higher rates."}
          </p>

          <div className="rounded-lg bg-white/[0.03] p-3 text-xs text-ink-400 ring-1 ring-inset ring-white/5">
            <p className="mb-1 font-medium text-ink-300">Two ways to move up:</p>
            <p>
              • Grow your network — a referral becomes a VIP once they verify KYC and play {VIP_TABLE_HOURS}+ table
              hours, so help yours get there.
            </p>
            <p className="mt-1">
              • Go pro — at {AGENT_MIN_VIP_NETWORK}+ VIP players you can request agent status, which unlocks the
              higher agent rakeback tiers (up to 50%).
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
