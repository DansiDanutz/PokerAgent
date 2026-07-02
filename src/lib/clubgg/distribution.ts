/**
 * ClubGG stats → distribution engine (pure).
 *
 * Turns parsed ClubGG "Club Data" rows into a fully-accounted distribution
 * PLAN with NO side effects. The repository consumes this to (a) show the
 * admin a dry-run preview and (b) apply the exact same numbers. Preview and
 * apply share this code so they can never disagree.
 *
 * THE MODEL — differential override down the agent tree
 * For each player's rake R, we split it among the player, every agent in their
 * upline chain, and the admin (house). Walking from the player UP to admin,
 * each level earns the SPREAD above the level below it:
 *
 *   player       playerRate · R
 *   agent A      (rateA − playerRate) · R          (only the part above the player)
 *   super S      (rateS − rateA)      · R          (only the part above agent A)
 *   admin        (1 − rateTop)        · R          (the residual — the house cut)
 *
 * This telescopes so Player + Agents + Admin === R exactly, with no
 * double-paying and correct math at any tree depth. Rates that don't increase
 * up the chain simply earn 0 for that level (clamped), and admin absorbs any
 * rounding so every line reconciles to the cent.
 *
 * Money is minor units (integer cents) throughout.
 */

import type { ClubggMemberStats } from "./statsImport";

/** One member's computed contribution + where their rake went. */
export interface StatsImportLine {
  clubggId: string;
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
  /** Table this row came from — present in per-table reports ("Game Detail"). */
  tableName?: string;
  /** Game type (NLH/PLO/…), when the report carries it. */
  gameType?: string;
  // --- where THIS player's rake is distributed (sums to `rake`) ---
  rakebackEligible: boolean;
  /** Paid to the player (their own rakeback). 0 if ineligible/unmatched. */
  playerRakeback: number;
  /** Total paid up the agent chain from this player's rake. */
  agentShare: number;
  /** Kept by the house from this player's rake (includes the residual + any forfeit). */
  adminShare: number;
}

/** One agent's settlement — their total override across all downline players. */
export interface AgentSettlementLine {
  agentId: string;
  username: string;
  /** Commission credited to the agent (cents). */
  commission: number;
}

/**
 * One agent's GAME-MONEY settlement for the period. The club is a zero-sum
 * chip pool across agent networks: when one network's players win chips from
 * another network's players at the tables, real money must follow between
 * those agents THROUGH the admin — the winning agent needs cash to pay his
 * winners, funded by what the admin collects from the losing agent (who in
 * turn collects from his losing players; that's his cash flow to manage).
 */
export interface GameSettlementLine {
  agentId: string;
  username: string;
  /**
   * Net P/L of the members whose cash flow this agent owns (cents, signed).
   * Positive → his network WON → admin PAYS the agent this amount.
   * Negative → his network LOST → admin COLLECTS this amount from the agent.
   */
  networkPnl: number;
}

export interface DistributionTotals {
  members: number;
  matched: number;
  unmatched: number;
  hands: number;
  /** Total rake in the file (cents). */
  rake: number;
  /** Total paid to players (cents). */
  playerRakeback: number;
  /** Total paid to agents (cents). */
  commission: number;
  /** Total kept by the house (cents). Invariant: player + commission + admin === rake. */
  adminKept: number;
  /** Game money: total admin must PAY to winning-network agents (cents, >= 0). */
  payToAgents: number;
  /** Game money: total admin must COLLECT from losing-network agents (cents, >= 0). */
  collectFromAgents: number;
}

/** The full, computed plan for one import — the contract preview & apply share. */
export interface StatsImportPlan {
  lines: StatsImportLine[];
  settlements: AgentSettlementLine[];
  /** Cross-network game-money obligations between admin and each agent. */
  gameSettlements: GameSettlementLine[];
  warnings: string[];
  totals: DistributionTotals;
  /** Set by apply: the persisted session this import was recorded as. */
  sessionId?: string;
}

/**
 * A PERSISTED import session — the economy's book of record. Every applied
 * import is stored permanently (summary + per-member lines), so the club has
 * a per-period history: daily sessions, rake splits over time, and each
 * player's hands/rake/P&L per period instead of only lifetime totals.
 */
export interface ImportSessionSummary {
  id: string;
  /** Human label, e.g. "Table 5 NLH.csv · 2026-07-02". */
  label: string;
  /** Original file name of the imported export, when uploaded as a file. */
  sourceFile?: string;
  createdAt: string; // ISO
  appliedBy: string; // admin user id
  totals: DistributionTotals;
}

/** Options accompanying one import — file identity for the session record. */
export interface StatsImportOptions {
  /** Original file name (one ClubGG export file = one session, e.g. one table/day). */
  sourceFile?: string;
}

export interface ImportSessionDetail extends ImportSessionSummary {
  /** The per-member period lines exactly as applied. */
  lines: StatsImportLine[];
}

/** One member's row in one session — the per-player history unit. */
export interface MemberSessionHistoryEntry {
  session: ImportSessionSummary;
  line: StatsImportLine;
}

/** Minimal member view the engine needs — decoupled from the full User type. */
export interface DistributionMember {
  id: string;
  username: string;
}

/**
 * Split one player's rake across the override chain + admin.
 *
 * `ratesUp` = [playerRate, nearestAgentRate, …, topAgentRate], each a 0..1
 * fraction, ordered from the player upward. Returns amounts in minor units
 * that sum EXACTLY to `rake` — admin (the residual) absorbs rounding.
 */
export function splitRake(
  rake: number,
  ratesUp: number[],
): { player: number; agents: number[]; admin: number } {
  let cumulative = 0;
  const parts: number[] = [];
  for (const rate of ratesUp) {
    const clamped = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
    const inc = Math.max(0, clamped - cumulative);
    parts.push(Math.round(inc * rake));
    cumulative = Math.max(cumulative, clamped);
  }
  const player = parts[0] ?? 0;
  const agents = parts.slice(1);
  const admin = rake - player - agents.reduce((s, a) => s + a, 0);
  return { player, agents, admin };
}

/**
 * Everything the pure planner needs from the repository, so the distribution
 * math lives in ONE place and both drivers (memory, Supabase) produce
 * identical plans. Each driver builds this context from its own IO.
 */
export interface DistributionContext {
  playerRakebackRate: number;
  /** Linked profile for a ClubGG id, if any. */
  membersByClubId: Map<string, DistributionMember>;
  /** Is this user KYC-eligible (L1+) to receive rakeback / drive agent commission? */
  rakebackEligible: (userId: string) => boolean;
  /** AGENT ancestors from nearest to top (agents only; stops before admin). */
  agentChainOf: (userId: string) => string[];
  /** The agent's effective commission rate (0 when frozen / below tier). */
  agentRate: (agentId: string) => number;
  agentUsername: (agentId: string) => string;
  /**
   * Who owns this user's CASH FLOW — an agent themselves, else their nearest
   * agent ancestor, or null when the user sits directly under admin (their
   * game P/L settles with the house implicitly, no agent obligation).
   */
  cashflowOwnerOf: (userId: string) => string | null;
}

function baseLine(row: ClubggMemberStats, member: DistributionMember | undefined, eligible: boolean): StatsImportLine {
  return {
    clubggId: row.clubggId,
    userId: member?.id,
    username: member?.username,
    matched: member !== undefined,
    nickname: row.nickname,
    handsPlayed: row.handsPlayed,
    tableHours: row.hours ?? 0,
    rake: row.rake,
    netProfit: row.profitLoss,
    buyIn: row.buyIn,
    cashOut: row.cashOut,
    tableName: row.tableName,
    gameType: row.gameType,
    rakebackEligible: eligible,
    playerRakeback: 0,
    agentShare: 0,
    adminShare: 0,
  };
}

/**
 * Compute the full distribution plan from parsed rows + repository context.
 * Pure and synchronous: all IO is resolved into `ctx` by the caller.
 */
export function planDistribution(rows: ClubggMemberStats[], ctx: DistributionContext): StatsImportPlan {
  const warnings: string[] = [];
  const agentCommission = new Map<string, number>();
  let adminKept = 0;

  const lines = rows.map((row) => {
    const member = ctx.membersByClubId.get(row.clubggId);
    const eligible = member ? ctx.rakebackEligible(member.id) : false;
    const line = baseLine(row, member, eligible);

    // Unmatched, or a not-yet-verified (L0) player: nothing can be
    // distributed downstream, so the house retains the whole rake. (The L0
    // case is the existing "verify KYC to start earning" lever.)
    if (!member) {
      warnings.push(`ClubGG id ${row.clubggId}${row.nickname ? ` (${row.nickname})` : ""} isn't linked to any member — its ${fmtNote(row.rake)} rake is held by the house.`);
    }
    if (!member || !eligible) {
      line.adminShare = row.rake;
      adminKept += row.rake;
      return line;
    }

    // Distribute R down the override chain: [playerRate, ...agent rates up].
    const chain = ctx.agentChainOf(member.id);
    const ratesUp = [ctx.playerRakebackRate, ...chain.map((id) => ctx.agentRate(id))];
    const { player, agents, admin } = splitRake(row.rake, ratesUp);

    line.playerRakeback = player;
    line.agentShare = agents.reduce((s, a) => s + a, 0);
    line.adminShare = admin;
    chain.forEach((agentId, i) => {
      const amt = agents[i] ?? 0;
      if (amt > 0) agentCommission.set(agentId, (agentCommission.get(agentId) ?? 0) + amt);
    });
    adminKept += admin;
    return line;
  });

  const settlements: AgentSettlementLine[] = [...agentCommission.entries()]
    .map(([agentId, commission]) => ({ agentId, username: ctx.agentUsername(agentId), commission }))
    .filter((s) => s.commission > 0)
    .sort((a, b) => b.commission - a.commission);

  // Game-money settlement: net each matched member's table P/L onto their
  // cash-flow owner. Unlike rakeback this deliberately IGNORES KYC
  // eligibility — chips that moved between networks at the tables are a real
  // money obligation between the agents and the admin regardless of a
  // player's verification state. (Unmatched rows can't be attributed and are
  // already warned about above.)
  const gamePnlByAgent = new Map<string, number>();
  for (const line of lines) {
    if (!line.matched || !line.userId || line.netProfit === 0) continue;
    const ownerId = ctx.cashflowOwnerOf(line.userId);
    if (!ownerId) continue; // sits directly under admin — the house absorbs it
    gamePnlByAgent.set(ownerId, (gamePnlByAgent.get(ownerId) ?? 0) + line.netProfit);
  }
  const gameSettlements: GameSettlementLine[] = [...gamePnlByAgent.entries()]
    .filter(([, pnl]) => pnl !== 0)
    .map(([agentId, networkPnl]) => ({ agentId, username: ctx.agentUsername(agentId), networkPnl }))
    .sort((a, b) => Math.abs(b.networkPnl) - Math.abs(a.networkPnl));

  const matched = lines.filter((l) => l.matched).length;
  const totals: DistributionTotals = {
    members: lines.length,
    matched,
    unmatched: lines.length - matched,
    hands: lines.reduce((s, l) => s + l.handsPlayed, 0),
    rake: lines.reduce((s, l) => s + l.rake, 0),
    playerRakeback: lines.reduce((s, l) => s + l.playerRakeback, 0),
    commission: settlements.reduce((s, a) => s + a.commission, 0),
    adminKept,
    payToAgents: gameSettlements.reduce((s, g) => s + Math.max(0, g.networkPnl), 0),
    collectFromAgents: gameSettlements.reduce((s, g) => s + Math.max(0, -g.networkPnl), 0),
  };

  return { lines, settlements, gameSettlements, warnings, totals };
}

/** Tiny inline money formatter for warning text (avoids a currency dependency here). */
function fmtNote(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
