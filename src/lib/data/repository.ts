/**
 * Repository interface — the single contract every data source (in-memory
 * seed, Supabase, …) implements. UI and server code depend only on this, so
 * the storage backend can be swapped without touching feature code.
 */

import type {
  AccountStatus,
  AdminOverview,
  KycStatus,
  NetworkNode,
  NetworkSummary,
  Notification,
  Role,
  Transaction,
  TransactionType,
  User,
} from "@/types/domain";
import type { ClubggMemberStats } from "@/lib/clubgg/statsImport";
import type {
  ImportSessionDetail,
  ImportSessionSummary,
  MemberSessionHistoryEntry,
  StatsImportOptions,
  StatsImportPlan,
} from "@/lib/clubgg/distribution";

export interface CreateTransferInput {
  fromUserId: string;
  toReferralCode: string;
  amount: number; // minor units, positive
  note?: string;
}

export interface RecordCashInput {
  userId: string;
  type: Extract<TransactionType, "deposit" | "adjustment" | "rake_rebate">;
  amount: number; // minor units, positive magnitude
  note?: string;
  processedBy?: string;
}

/** One agent absorbing one player's negative balance during the daily sweep. */
export interface SweepResult {
  playerId: string;
  agentId: string;
  amount: number; // positive magnitude swept (player shortfall)
  /** True when this sweep pushed the agent's own balance below zero. */
  agentNowNegative: boolean;
}

/** One agent's rakeback tier changing during the monthly recalculation. */
export interface RakebackTierChange {
  agentId: string;
  previousRate: number; // 0-1
  newRate: number; // 0-1
  /** VIP players who played 20h+ during the completed month. */
  qualifiedVipCount: number;
}

export interface CreateMemberInput {
  username: string;
  fullName: string;
  email: string;
  role?: Role;
  /** Referral code of the upline agent this member joins under. */
  uplineReferralCode?: string;
  clubggId?: string;
  /** Opening balance in minor units. */
  balance?: number;
}

export interface CreateAccountInput {
  username: string;
  fullName: string;
  email: string;
  passwordHash: string;
  uplineReferralCode?: string;
}

export interface AuthCredential {
  id: string;
  passwordHash: string;
}

export interface CreditMemberInput {
  /** The agent performing the credit (must be the member's upline). */
  agentId: string;
  memberId: string;
  type: Extract<TransactionType, "deposit" | "rake_rebate" | "adjustment">;
  amount: number; // minor units, positive magnitude
  note?: string;
}

export interface Repository {
  // --- auth ---
  /** Look up a credential by email (case-insensitive). Self-service signup. */
  findAuthByEmail(email: string): Promise<AuthCredential | null>;
  /** Create a self-service account (always a player) with a password hash. */
  createAccount(input: CreateAccountInput): Promise<User>;
  /** Replace a user's password hash. */
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;

  // --- users ---
  getUser(id: string): Promise<User | null>;
  getUserByReferralCode(code: string): Promise<User | null>;
  /** Exact, case-insensitive email lookup (used by OAuth sign-in to find-or-create). */
  findUserByEmail(email: string): Promise<User | null>;
  listUsers(filter?: { role?: Role; q?: string }): Promise<User[]>;

  // --- network (agent tree) ---
  getNetworkTree(agentId: string): Promise<NetworkNode | null>;
  getNetworkSummary(agentId: string): Promise<NetworkSummary>;
  /** Flattened list of every user in an agent's downline subtree. */
  listDownline(agentId: string): Promise<User[]>;
  /** True when `agentId` is an ancestor (upline) of `userId`. */
  isUpline(agentId: string, userId: string): Promise<boolean>;
  /**
   * Free-agency move: a user who has gone 365+ days without activity may
   * leave their current agent and attach to a new one by referral code.
   * Notifies the user and both the old and new agent.
   */
  changeUpline(userId: string, newReferralCode: string): Promise<User>;

  // --- agent member management (authorized: agent must be the member's upline) ---
  creditMember(input: CreditMemberInput): Promise<Transaction>;
  setMemberTableHours(agentId: string, memberId: string, hours: number): Promise<User>;
  /**
   * Agent sets a per-player credit limit (max negative balance covered). Player
   * must be a DIRECT report; the sum of an agent's limits cannot exceed their
   * own balance. Admin may set any agent's player and bypasses the aggregate cap.
   */
  setPlayerCreditLimit(actorId: string, playerId: string, creditLimit: number): Promise<User>;

  // --- agent promotion: request (player) → approve (admin only) ---
  /** A qualifying player asks to become an agent. */
  requestAgentStatus(userId: string): Promise<User>;
  /** Admin approves or rejects a pending agent request. Admin only. */
  decideAgentRequest(adminId: string, userId: string, decision: "approved" | "rejected"): Promise<User>;
  /** Pending agent requests for the admin queue. */
  listAgentRequests(): Promise<User[]>;
  /** Approve/reject a pending transaction belonging to the agent's downline. */
  decideMemberTransaction(
    agentId: string,
    txId: string,
    status: "approved" | "rejected",
  ): Promise<Transaction>;

  // --- wallet / transactions ---
  listTransactions(userId: string): Promise<Transaction[]>;
  recordCash(input: RecordCashInput): Promise<Transaction>;
  transfer(input: CreateTransferInput): Promise<{ out: Transaction; in: Transaction }>;
  setTransactionStatus(
    id: string,
    status: Transaction["status"],
    processedBy: string,
  ): Promise<Transaction>;

  // --- agent credit / settlement (admin funds agent balances) ---
  /** Agent asks admin for a credit line — a pending agent_credit transaction. */
  requestAgentCredit(agentId: string, amount: number, note?: string): Promise<Transaction>;
  /** Admin approves (funds agent balance) or rejects a pending credit request. */
  decideAgentCredit(adminId: string, txId: string, decision: "approved" | "rejected"): Promise<Transaction>;
  /** Pending agent_credit requests, for the admin Settlement queue. */
  listAgentCreditRequests(): Promise<Transaction[]>;
  /** All agent_credit transactions (any status) — full settlement audit history. */
  listSettlements(): Promise<Transaction[]>;

  // --- daily risk settlement (cron) ---
  /** Sweep every negative player balance onto their direct agent. */
  sweepNegativeBalances(): Promise<SweepResult[]>;
  /** Create a notification (used by the sweep job and other money events). */
  addNotification(input: Omit<Notification, "id" | "read" | "createdAt">): Promise<Notification>;

  // --- ClubGG stats import (admin: distribute a downloaded stats period) ---
  /**
   * Compute the full distribution PLAN for a set of parsed ClubGG rows WITHOUT
   * mutating anything — the admin's dry-run preview. Links rows to profiles by
   * clubgg_id, computes per-member stat deltas + personal rakeback and
   * per-agent settlements. Admin only.
   */
  previewStatsImport(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan>;
  /**
   * Apply a stats period: increment each matched member's stats, pay personal
   * rakeback, and settle each agent's commission — atomically. Returns the plan
   * that was actually applied (with the persisted session id). One export file
   * (e.g. one table's daily report) = one call = one session. Admin only.
   */
  applyStatsImport(adminId: string, rows: ClubggMemberStats[], opts?: StatsImportOptions): Promise<StatsImportPlan>;
  /**
   * Estimate how an agent's downline's LIFETIME rake would distribute under the
   * current override model — the SAME engine imports use, so the "your
   * commission" figure an agent sees matches what they actually get paid. The
   * chain is capped at the viewing agent (their subtree view): players and
   * sub-agents earn their slice, the agent earns their override, and the
   * residual flows "upstream" (their uplines + house). Read-only.
   */
  estimateDistribution(agentId: string): Promise<StatsImportPlan>;

  // --- economy ledger: persisted import sessions (admin only) ---
  /** All applied import sessions, newest first — the club's period history. */
  listImportSessions(adminId: string): Promise<ImportSessionSummary[]>;
  /** One session with its per-member lines, or null if unknown. */
  getImportSession(adminId: string, sessionId: string): Promise<ImportSessionDetail | null>;
  /** A member's per-session history (their line in every session they appear in), newest first. */
  listMemberImportHistory(adminId: string, userId: string): Promise<MemberSessionHistoryEntry[]>;

  // --- monthly rakeback tier recalculation (cron) ---
  /**
   * Recomputes every agent's locked `currentRakebackRate` from VIP players
   * who played `AGENT_MIN_MONTHLY_HOURS`+ since the last run, then resets
   * the hours snapshot baseline for every user. Run once a month.
   */
  recalculateMonthlyRakebackTiers(): Promise<RakebackTierChange[]>;

  // --- notifications ---
  listNotifications(userId: string): Promise<Notification[]>;
  /** Marks a notification read — only its owner may do this. */
  markNotificationRead(id: string, userId: string): Promise<void>;

  // --- admin (admin-only; actorId must be an admin) ---
  getAdminOverview(): Promise<AdminOverview>;
  listPendingTransactions(): Promise<Transaction[]>;
  createMember(adminId: string, input: CreateMemberInput): Promise<User>;
  setKycStatus(adminId: string, userId: string, status: KycStatus): Promise<User>;
  setAccountStatus(adminId: string, userId: string, status: AccountStatus): Promise<User>;
  setUserRole(adminId: string, userId: string, role: Role): Promise<User>;
  /** Post a signed balance adjustment (positive credit / negative debit). */
  adminAdjustBalance(
    adminId: string,
    userId: string,
    amount: number,
    note?: string,
  ): Promise<Transaction>;
}
