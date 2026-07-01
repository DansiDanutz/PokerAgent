/**
 * Player level & status system.
 *
 * Levels are a data-driven ladder so new tiers are trivial to add — edit the
 * LEVELS array, nothing else. A player's current level is the highest level
 * whose requirements they meet.
 *
 *   Level 0  New Player   — signed up
 *   Level 1  Player       — + KYC verified
 *   Level 2  VIP Player   — + 4 hours played at a table
 *   Level 3+ — referral-based placeholders; set the real thresholds here.
 *
 * "Path to Agent" (AGENT_REQUIREMENTS) defines what a player must reach to be
 * promoted to agent. Defaults are placeholders — adjust the targets freely.
 */

import type { MemberStatus } from "@/types/domain";

export const VIP_TABLE_HOURS = 4;

export interface LevelRequirement {
  /** KYC must be verified. */
  kyc?: boolean;
  /** Minimum table hours played. */
  minTableHours?: number;
  /** Minimum direct referrals in the player's tree. */
  minDirectReferrals?: number;
}

export interface PlayerLevel {
  level: number;
  name: string;
  /** Status label for the first tiers (L0–L2). */
  status?: MemberStatus;
  requires: LevelRequirement;
  perk: string;
}

export const LEVELS: PlayerLevel[] = [
  { level: 0, name: "New Player", status: "new_player", requires: {}, perk: "Account created" },
  { level: 1, name: "Player", status: "player", requires: { kyc: true }, perk: "Deposits & rakeback unlocked" },
  {
    level: 2,
    name: "VIP Player",
    status: "vip_player",
    requires: { kyc: true, minTableHours: VIP_TABLE_HOURS },
    perk: "VIP rakeback & freerolls",
  },
  // --- Configurable higher tiers (placeholder thresholds) -------------------
  { level: 3, name: "Affiliate", requires: { kyc: true, minTableHours: VIP_TABLE_HOURS, minDirectReferrals: 3 }, perk: "Referral commission" },
  { level: 4, name: "Super Affiliate", requires: { kyc: true, minTableHours: 20, minDirectReferrals: 10 }, perk: "Higher commission tier" },
];

export interface LevelInputs {
  kycVerified: boolean;
  tableHours: number;
  directReferrals: number;
}

function meetsRequirement(req: LevelRequirement, input: LevelInputs): boolean {
  if (req.kyc && !input.kycVerified) return false;
  if (req.minTableHours !== undefined && input.tableHours < req.minTableHours) return false;
  if (req.minDirectReferrals !== undefined && input.directReferrals < req.minDirectReferrals) return false;
  return true;
}

/** The highest level whose requirements the player meets. */
export function currentLevel(input: LevelInputs): PlayerLevel {
  let best = LEVELS[0];
  for (const lvl of LEVELS) {
    if (meetsRequirement(lvl.requires, input)) best = lvl;
    else break; // requirements are monotonic — stop at the first miss
  }
  return best;
}

/** The next level up, or null if already at the top. */
export function nextLevel(input: LevelInputs): PlayerLevel | null {
  const cur = currentLevel(input);
  return LEVELS.find((l) => l.level === cur.level + 1) ?? null;
}

/** Member status label (New / Player / VIP), derived from the current level. */
export function memberStatus(input: LevelInputs): MemberStatus {
  const lvl = currentLevel(input);
  if (lvl.status) return lvl.status;
  // Levels above 2 are still "VIP" for status-badge purposes.
  return "vip_player";
}

/**
 * Rakeback unlocks at L1 (KYC verified). An L0 player can still play, but
 * neither they nor their upline agent receive rakeback for that play until
 * KYC clears — this is what an agent needs to chase to start earning.
 */
export function isRakebackEligible(input: LevelInputs): boolean {
  return currentLevel(input).level >= 1;
}

/**
 * Referral earning unlocks at L2 (VIP Player) — below that, a player can
 * still hold and share a referral code, but doesn't yet earn commission
 * from their own downline the way an L2+ player or agent does.
 */
export function canEarnReferrals(input: LevelInputs): boolean {
  return currentLevel(input).level >= 2;
}

export const STATUS_LABEL: Record<MemberStatus, string> = {
  new_player: "New",
  player: "Player",
  vip_player: "VIP",
};

// ---- Path to Agent ---------------------------------------------------------

/**
 * Anyone can refer friends, and referral earning unlocks per-user at VIP
 * (L2+, see `canEarnReferrals`). Becoming an agent is a separate, single
 * threshold: grow your own network to at least this many VIP+ players
 * (not counting yourself).
 */
export const AGENT_MIN_VIP_NETWORK = 10;

export interface AgentProgressInput {
  /** VIP+ (L2+) players anywhere in the user's network, excluding themselves. */
  vipNetworkCount: number;
}

export function agentProgress(input: AgentProgressInput): {
  current: number;
  target: number;
  eligible: boolean;
} {
  return {
    current: input.vipNetworkCount,
    target: AGENT_MIN_VIP_NETWORK,
    eligible: input.vipNetworkCount >= AGENT_MIN_VIP_NETWORK,
  };
}

// ---- Rakeback tiers ---------------------------------------------------------

export interface RakebackTier {
  minVip: number;
  rate: number; // 0-1
}

/**
 * Plain VIP referrers (not agents) — recalculated live from the current VIP
 * network count. Caps at 20%: growing past 10 VIP players without becoming
 * an agent doesn't earn more — that's what the agent tiers are for.
 */
export const REFERRAL_RAKEBACK_TIERS: RakebackTier[] = [
  { minVip: 1, rate: 0.05 },
  { minVip: 4, rate: 0.10 },
  { minVip: 6, rate: 0.15 },
  { minVip: 10, rate: 0.20 },
];

/**
 * Agents — locked once a month (see `recalculateMonthlyRakebackTiers` on the
 * repository), based on VIP players who each played
 * `AGENT_MIN_MONTHLY_HOURS`+ during the prior month.
 */
export const AGENT_RAKEBACK_TIERS: RakebackTier[] = [
  { minVip: 10, rate: 0.25 },
  { minVip: 15, rate: 0.30 },
  { minVip: 20, rate: 0.40 },
  { minVip: 25, rate: 0.50 },
];

export const AGENT_MIN_MONTHLY_HOURS = 20;

/** The highest tier whose `minVip` the count meets; 0 if below every tier. */
export function rakebackRateForTier(tiers: RakebackTier[], vipCount: number): number {
  let rate = 0;
  for (const tier of tiers) {
    if (vipCount >= tier.minVip) rate = tier.rate;
  }
  return rate;
}

/** The next tier up (for "N more VIP players to reach X%" UI), or null at the top. */
export function nextRakebackTier(tiers: RakebackTier[], vipCount: number): RakebackTier | null {
  return tiers.find((t) => vipCount < t.minVip) ?? null;
}
