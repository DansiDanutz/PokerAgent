/**
 * ClubGG stats → distribution engine (pure).
 *
 * Turns parsed ClubGG "Club Data" rows into a fully-computed distribution
 * PLAN — per-member stat deltas + rakeback, and per-agent settlements — with
 * NO side effects. The repository consumes this to (a) show the admin a
 * dry-run preview and (b) apply the exact same numbers to balances. Preview
 * and apply share this code so they can never disagree.
 *
 * Money is minor units (integer cents) throughout, matching the ledger.
 */

import type { ClubggMemberStats } from "./statsImport";

/** One member's computed contribution for the imported period. */
export interface StatsImportLine {
  clubggId: string;
  /** Linked platform user, when the clubggId matched a profile. */
  userId?: string;
  username?: string;
  matched: boolean;
  nickname?: string;
  // --- stat deltas applied to the member (all additive) ---
  handsPlayed: number;
  tableHours: number;
  rake: number;
  netProfit: number;
  buyIn: number;
  cashOut: number;
  // --- payout ---
  /** True when this player is KYC-eligible (L1+) to receive rakeback. */
  rakebackEligible: boolean;
  /** Personal rakeback credited to the player (cents). 0 when ineligible/unmatched. */
  playerRakeback: number;
}

/** One agent's settlement for the imported period (admin ↔ agent). */
export interface AgentSettlementLine {
  agentId: string;
  username: string;
  /** This period's own-business, rakeback-eligible rake attributed to the agent (cents). */
  periodRake: number;
  /** The agent's effective commission rate (0-1). */
  rate: number;
  /** Commission credited to the agent (cents). */
  commission: number;
}

export interface DistributionTotals {
  members: number;
  matched: number;
  unmatched: number;
  hands: number;
  rake: number;
  playerRakeback: number;
  commission: number;
}

/** The full, computed plan for one import — the contract preview & apply share. */
export interface StatsImportPlan {
  lines: StatsImportLine[];
  settlements: AgentSettlementLine[];
  warnings: string[];
  totals: DistributionTotals;
}

/** Minimal member view the engine needs — decoupled from the full User type. */
export interface DistributionMember {
  id: string;
  username: string;
}

/**
 * Compute one member line from a parsed CSV row. Pure: eligibility is decided
 * by the caller (it needs level/KYC context) and passed in, so this stays a
 * simple, total function over its inputs.
 */
export function computeMemberLine(
  row: ClubggMemberStats,
  member: DistributionMember | undefined,
  opts: { rakebackEligible: boolean; playerRakebackRate: number },
): StatsImportLine {
  const matched = member !== undefined;
  const rakebackEligible = matched && opts.rakebackEligible;
  const playerRakeback = rakebackEligible ? Math.round(row.rake * opts.playerRakebackRate) : 0;
  return {
    clubggId: row.clubggId,
    userId: member?.id,
    username: member?.username,
    matched,
    nickname: row.nickname,
    handsPlayed: row.handsPlayed,
    tableHours: row.hours ?? 0,
    rake: row.rake,
    netProfit: row.profitLoss,
    buyIn: row.buyIn,
    cashOut: row.cashOut,
    rakebackEligible,
    playerRakeback,
  };
}

/** The commission an agent earns on a slice of period rake. */
export function commissionFor(periodRake: number, rate: number): number {
  return Math.round(periodRake * rate);
}

/**
 * Everything the pure planner needs from the repository, so the distribution
 * math lives in ONE place and both drivers (memory, Supabase) produce
 * byte-identical plans. Each driver builds this context from its own IO.
 */
export interface DistributionContext {
  playerRakebackRate: number;
  /** Linked profile for a ClubGG id, if any. */
  membersByClubId: Map<string, DistributionMember>;
  /** Is this user KYC-eligible (L1+) to receive rakeback? */
  rakebackEligible: (userId: string) => boolean;
  /** Nearest AGENT ancestor (own-business owner), or null if only admin is above. */
  ownerAgentOf: (userId: string) => string | null;
  /** The agent's effective commission rate (0 when frozen / below tier). */
  agentRate: (agentId: string) => number;
  agentUsername: (agentId: string) => string;
}

/**
 * Compute the full distribution plan from parsed rows + repository context.
 * Pure and synchronous: all IO is resolved into `ctx` by the caller.
 */
export function planDistribution(rows: ClubggMemberStats[], ctx: DistributionContext): StatsImportPlan {
  const warnings: string[] = [];
  const lines = rows.map((row) => {
    const member = ctx.membersByClubId.get(row.clubggId);
    const rakebackEligible = member ? ctx.rakebackEligible(member.id) : false;
    if (!member) {
      warnings.push(`ClubGG id ${row.clubggId}${row.nickname ? ` (${row.nickname})` : ""} isn't linked to any member — skipped.`);
    }
    return computeMemberLine(row, member, { rakebackEligible, playerRakebackRate: ctx.playerRakebackRate });
  });

  // Attribute each eligible member's period rake to their nearest agent.
  const periodRakeByAgent = new Map<string, number>();
  for (const line of lines) {
    if (!line.matched || !line.rakebackEligible || line.rake <= 0 || !line.userId) continue;
    const agentId = ctx.ownerAgentOf(line.userId);
    if (!agentId) continue;
    periodRakeByAgent.set(agentId, (periodRakeByAgent.get(agentId) ?? 0) + line.rake);
  }
  const settlements: AgentSettlementLine[] = [];
  for (const [agentId, periodRake] of periodRakeByAgent) {
    const rate = ctx.agentRate(agentId);
    const commission = commissionFor(periodRake, rate);
    if (commission <= 0) continue;
    settlements.push({ agentId, username: ctx.agentUsername(agentId), periodRake, rate, commission });
  }

  return { lines, settlements, warnings, totals: summarizeTotals(lines, settlements) };
}

/** Roll member lines + agent settlements into headline totals. */
export function summarizeTotals(
  lines: StatsImportLine[],
  settlements: AgentSettlementLine[],
): DistributionTotals {
  const matched = lines.filter((l) => l.matched).length;
  return {
    members: lines.length,
    matched,
    unmatched: lines.length - matched,
    hands: lines.reduce((s, l) => s + l.handsPlayed, 0),
    rake: lines.reduce((s, l) => s + l.rake, 0),
    playerRakeback: lines.reduce((s, l) => s + l.playerRakeback, 0),
    commission: settlements.reduce((s, a) => s + a.commission, 0),
  };
}
