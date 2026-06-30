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
  { level: 3, name: "Level 3 · Affiliate", requires: { kyc: true, minTableHours: VIP_TABLE_HOURS, minDirectReferrals: 3 }, perk: "Referral commission" },
  { level: 4, name: "Level 4 · Super Affiliate", requires: { kyc: true, minTableHours: 20, minDirectReferrals: 10 }, perk: "Higher commission tier" },
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

export const STATUS_LABEL: Record<MemberStatus, string> = {
  new_player: "New Player",
  player: "Player",
  vip_player: "VIP Player",
};

// ---- Path to Agent ---------------------------------------------------------

export interface AgentRequirement {
  key: "level" | "referrals" | "vipReferrals";
  label: string;
  target: number;
}

/** Placeholder promotion criteria — adjust the targets to your program. */
export const AGENT_REQUIREMENTS: AgentRequirement[] = [
  { key: "level", label: "Reach VIP Player (Level 2)", target: 2 },
  { key: "referrals", label: "Refer 3 members", target: 3 },
  { key: "vipReferrals", label: "1 referral reaches VIP", target: 1 },
];

export interface AgentProgressInput {
  level: number;
  directReferrals: number;
  vipReferrals: number;
}

export interface AgentProgressItem extends AgentRequirement {
  current: number;
  done: boolean;
}

export function agentProgress(input: AgentProgressInput): {
  items: AgentProgressItem[];
  eligible: boolean;
  completed: number;
} {
  const valueFor = (key: AgentRequirement["key"]): number =>
    key === "level" ? input.level : key === "referrals" ? input.directReferrals : input.vipReferrals;
  const items = AGENT_REQUIREMENTS.map((r) => {
    const current = valueFor(r.key);
    return { ...r, current, done: current >= r.target };
  });
  const completed = items.filter((i) => i.done).length;
  return { items, eligible: completed === items.length, completed };
}
