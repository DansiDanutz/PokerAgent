/**
 * Supabase-backed repository (server-only).
 *
 * Talks to the `pa_`-prefixed tables with the service-role key. All access is
 * server-side; authorization is enforced here (mirroring MemoryRepository) and
 * RLS denies anon/public access as defence-in-depth.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountStatus,
  AdminOverview,
  KycStatus,
  NetworkNode,
  NetworkSummary,
  Notification,
  Role,
  Transaction,
  User,
} from "@/types/domain";
import type {
  AuthCredential,
  CreateAccountInput,
  CreateMemberInput,
  CreateTransferInput,
  CreditMemberInput,
  RakebackTierChange,
  RecordCashInput,
  Repository,
  SweepResult,
} from "./repository";
import type { ClubggMemberStats } from "@/lib/clubgg/statsImport";
import { planDistribution, type StatsImportPlan, type DistributionMember } from "@/lib/clubgg/distribution";
import { buildNewMember } from "./newMember";
import { ADMIN_EMAIL, isAdminEmail } from "@/lib/governance";
import {
  isRakebackEligible,
  canEarnReferrals,
  memberStatus,
  agentProgress,
  AGENT_MIN_VIP_NETWORK,
  rakebackRateForTier,
  REFERRAL_RAKEBACK_TIERS,
  AGENT_RAKEBACK_TIERS,
  AGENT_MIN_MONTHLY_HOURS,
} from "@/lib/levels";
import { CLUB } from "@/lib/clubgg";
import { flattenNetwork, flattenOwnBusiness } from "@/lib/network";
import { isDormant } from "@/lib/activity";
import { formatMoney } from "@/lib/format";

type ProfileRow = {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  avatar_url: string | null;
  role: Role;
  status: AccountStatus;
  kyc_status: KycStatus;
  upline_agent_id: string | null;
  referral_code: string;
  clubgg_id: string | null;
  clubgg_nickname: string | null;
  agent_request: "none" | "pending" | "rejected" | null;
  balance: number;
  credit_limit: number | null;
  currency: string;
  hands_played: number;
  net_profit: number;
  rake_generated: number;
  win_rate_bb100: number;
  sessions: number;
  table_hours: number;
  last_monthly_snapshot_hours: number | null;
  current_rakeback_rate: number | null;
  rakeback_tier_as_of: string | null;
  created_at: string;
  last_active_at: string | null;
};

type TxRow = {
  id: string;
  user_id: string;
  counterparty_id: string | null;
  type: Transaction["type"];
  amount: number;
  currency: string;
  status: Transaction["status"];
  note: string | null;
  processed_by: string | null;
  created_at: string;
};

type NotifRow = {
  id: string;
  user_id: string;
  kind: Notification["kind"];
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

function toUser(r: ProfileRow): User {
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone ?? undefined,
    country: r.country ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    role: r.role,
    status: r.status,
    kycStatus: r.kyc_status,
    uplineAgentId: r.upline_agent_id,
    referralCode: r.referral_code,
    clubggId: r.clubgg_id ?? undefined,
    clubggNickname: r.clubgg_nickname ?? undefined,
    agentRequest: r.agent_request ?? "none",
    balance: r.balance,
    creditLimit: r.credit_limit ?? 0,
    currency: r.currency,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at ?? undefined,
    currentRakebackRate: r.current_rakeback_rate ?? undefined,
    rakebackTierAsOf: r.rakeback_tier_as_of ?? undefined,
    stats: {
      handsPlayed: r.hands_played,
      netProfit: r.net_profit,
      rakeGenerated: r.rake_generated,
      winRateBb100: Number(r.win_rate_bb100),
      sessions: r.sessions,
      tableHours: Number(r.table_hours),
      lastMonthlySnapshotHours: r.last_monthly_snapshot_hours == null ? undefined : Number(r.last_monthly_snapshot_hours),
    },
  };
}

function toTx(r: TxRow): Transaction {
  return {
    id: r.id,
    userId: r.user_id,
    counterpartyId: r.counterparty_id ?? undefined,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    note: r.note ?? undefined,
    createdAt: r.created_at,
    processedBy: r.processed_by ?? undefined,
  };
}

function toNotif(r: NotifRow): Notification {
  return { id: r.id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body, read: r.read, createdAt: r.created_at };
}

/** `LevelInputs` shape for a network node — VIP/rakeback status is driven by the member themselves, not the viewer. */
function levelInputsFor(n: NetworkNode): { kycVerified: boolean; tableHours: number; directReferrals: number } {
  return {
    kycVerified: n.user.kycStatus === "verified",
    tableHours: n.user.stats.tableHours,
    directReferrals: n.children.length,
  };
}

function nodeOf(u: User, all: User[]): NetworkNode {
  const children = all.filter((x) => x.uplineAgentId === u.id).map((c) => nodeOf(c, all));
  return {
    user: {
      id: u.id, username: u.username, fullName: u.fullName, avatarUrl: u.avatarUrl,
      role: u.role, balance: u.balance, currency: u.currency, stats: u.stats, kycStatus: u.kycStatus,
    },
    children,
    subtreeSize: children.length + children.reduce((s, c) => s + c.subtreeSize, 0),
    subtreeRake: u.stats.rakeGenerated + children.reduce((s, c) => s + c.subtreeRake, 0),
  };
}

/**
 * Logs the real Postgres/driver error server-side and throws a sanitized
 * message instead — raw error text can carry constraint/column/schema names
 * that shouldn't reach a client via a server action's error message. A few
 * expected constraint violations get a friendly translation; everything else
 * becomes a generic message.
 */
function dbError(error: { message: string; code?: string }): never {
  console.error("[supabase]", error);
  if (error.message.includes("pa_profiles_balance_floor_check")) {
    throw new Error("That would put the balance below the allowed credit limit");
  }
  if (error.message.includes("pa_transactions_amount_nonzero_check")) {
    throw new Error("Amount cannot be zero");
  }
  if (error.code === "23505") {
    throw new Error("That value is already in use");
  }
  throw new Error("Something went wrong. Please try again.");
}

export class SupabaseRepository implements Repository {
  private db: SupabaseClient;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    }
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /**
   * Explicit column list, deliberately excluding `password_hash` — every
   * caller of `allProfiles`/`profile` maps through `toUser()`, which never
   * reads that column, so there's no reason to pull a scrypt hash into app
   * memory on every profile read. `findAuthByEmail` is the only method that
   * legitimately needs it and selects it explicitly.
   */
  private static readonly PROFILE_COLUMNS =
    "id, username, full_name, email, phone, country, avatar_url, role, status, kyc_status, " +
    "upline_agent_id, referral_code, clubgg_id, clubgg_nickname, agent_request, balance, " +
    "credit_limit, currency, hands_played, net_profit, rake_generated, win_rate_bb100, sessions, " +
    "table_hours, last_monthly_snapshot_hours, current_rakeback_rate, rakeback_tier_as_of, " +
    "created_at, last_active_at";

  private async allProfiles(): Promise<User[]> {
    const { data, error } = await this.db.from("pa_profiles").select(SupabaseRepository.PROFILE_COLUMNS);
    if (error) dbError(error);
    return (data as unknown as ProfileRow[]).map(toUser);
  }

  private async profile(id: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select(SupabaseRepository.PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (error) dbError(error);
    return data ? toUser(data as unknown as ProfileRow) : null;
  }

  /**
   * Atomic `balance += delta` via a Postgres function (not a JS
   * read-then-write) — see supabase/migrations/20260701114746_pokeragent_atomic_money_ops.sql.
   * A plain SELECT-then-UPDATE here would race under concurrent requests.
   */
  private async adjustBalance(id: string, delta: number): Promise<number> {
    const { data, error } = await this.db.rpc("pa_adjust_balance", { p_user_id: id, p_delta: delta });
    if (error) dbError(error);
    return data as number;
  }

  private newId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  async findAuthByEmail(email: string): Promise<AuthCredential | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select("id, password_hash").ilike("email", email.trim()).maybeSingle();
    if (error) dbError(error);
    if (!data || !(data as { password_hash: string | null }).password_hash) return null;
    return { id: (data as { id: string }).id, passwordHash: (data as { password_hash: string }).password_hash };
  }

  async createAccount(input: CreateAccountInput): Promise<User> {
    const norm = input.email.trim().toLowerCase();
    const { data: dupEmail } = await this.db.from("pa_profiles").select("id").ilike("email", norm).maybeSingle();
    if (dupEmail) throw new Error("An account with that email already exists");
    const { data: dupUser } = await this.db
      .from("pa_profiles").select("id").ilike("username", input.username.trim()).maybeSingle();
    if (dupUser) throw new Error("That username is taken");
    let uplineId: string | null = null;
    if (input.uplineReferralCode) {
      const upline = await this.getUserByReferralCode(input.uplineReferralCode);
      if (upline) uplineId = upline.id;
    }
    const member = buildNewMember(
      { username: input.username, fullName: input.fullName, email: input.email, role: "player" },
      this.newId("u"),
      uplineId,
      crypto.randomUUID(),
    );
    const { error } = await this.db.from("pa_profiles").insert({
      id: member.id, username: member.username, full_name: member.fullName, email: member.email,
      role: "player", status: member.status, kyc_status: member.kycStatus,
      upline_agent_id: member.uplineAgentId, referral_code: member.referralCode,
      clubgg_id: null, clubgg_nickname: member.clubggNickname ?? null, agent_request: "none",
      balance: 0, currency: member.currency, table_hours: 0, created_at: member.createdAt,
      password_hash: input.passwordHash,
    });
    if (error) dbError(error);
    return member;
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const { error } = await this.db.from("pa_profiles").update({ password_hash: passwordHash }).eq("id", userId);
    if (error) dbError(error);
  }

  async getUser(id: string): Promise<User | null> {
    return this.profile(id);
  }

  async getUserByReferralCode(code: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select(SupabaseRepository.PROFILE_COLUMNS).ilike("referral_code", code.trim()).maybeSingle();
    if (error) dbError(error);
    return data ? toUser(data as unknown as ProfileRow) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select(SupabaseRepository.PROFILE_COLUMNS).ilike("email", email.trim()).maybeSingle();
    if (error) dbError(error);
    return data ? toUser(data as unknown as ProfileRow) : null;
  }

  async listUsers(filter?: { role?: Role; q?: string }): Promise<User[]> {
    let users = await this.allProfiles();
    if (filter?.role) users = users.filter((u) => u.role === filter.role);
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      users = users.filter(
        (u) => u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    return users.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async getNetworkTree(agentId: string): Promise<NetworkNode | null> {
    const all = await this.allProfiles();
    const root = all.find((u) => u.id === agentId);
    return root ? nodeOf(root, all) : null;
  }

  async getNetworkSummary(agentId: string): Promise<NetworkSummary> {
    const all = await this.allProfiles();
    const root = all.find((u) => u.id === agentId);
    const node = root ? nodeOf(root, all) : null;
    // Whole subtree — informational totals only ("how big is your empire").
    const flat = node ? flattenNetwork(node) : [];
    // "Own business" — stops descending past a nested agent, since a
    // sub-agent's downline is that sub-agent's tier, not their upline's.
    // This is the scope that drives every money calculation below.
    const own = node ? flattenOwnBusiness(node) : [];

    // L0 (not yet KYC-verified) players can play, but their rake doesn't
    // count toward the agent's commission until they reach L1.
    const rakebackEligibleOwn = own.filter((n) => isRakebackEligible(levelInputsFor(n)));
    const networkRake = rakebackEligibleOwn.reduce((s, n) => s + n.user.stats.rakeGenerated, 0);
    const vipNetworkCount = own.filter((n) => memberStatus(levelInputsFor(n)) === "vip_player").length;

    const frozen = (root?.balance ?? 0) < 0;
    // Anyone can refer friends, but earning commission from your own network
    // requires YOU to be VIP (L2+) — a brand-new player can grow a tree, they
    // just don't get paid from it until they reach VIP themselves.
    const selfEarns =
      !!root &&
      canEarnReferrals({
        kycVerified: root.kycStatus === "verified",
        tableHours: root.stats.tableHours,
        directReferrals: all.filter((u) => u.uplineAgentId === root.id).length,
      });

    let commissionRate = 0;
    if (root && selfEarns && !frozen) {
      commissionRate =
        root.role === "agent"
          ? (root.currentRakebackRate ?? rakebackRateForTier(AGENT_RAKEBACK_TIERS, vipNetworkCount))
          : rakebackRateForTier(REFERRAL_RAKEBACK_TIERS, vipNetworkCount);
    }

    return {
      directReferrals: root ? all.filter((u) => u.uplineAgentId === root.id).length : 0,
      totalNetwork: flat.length,
      activePlayers: flat.filter((n) => n.user.stats.handsPlayed > 0).length,
      networkRake,
      commissionEarned: Math.round(networkRake * commissionRate),
      commissionRate,
      vipNetworkCount,
      frozen,
      currency: root?.currency ?? "USD",
    };
  }

  async listDownline(agentId: string): Promise<User[]> {
    const all = await this.allProfiles();
    const out: User[] = [];
    const walk = (id: string) => {
      for (const c of all.filter((u) => u.uplineAgentId === id)) { out.push(c); walk(c.id); }
    };
    walk(agentId);
    return out;
  }

  async isUpline(agentId: string, userId: string): Promise<boolean> {
    const all = await this.allProfiles();
    const byId = new Map(all.map((u) => [u.id, u]));
    let cur = byId.get(userId)?.uplineAgentId ?? null;
    let guard = 0;
    while (cur && guard < 50) {
      if (cur === agentId) return true;
      cur = byId.get(cur)?.uplineAgentId ?? null;
      guard++;
    }
    return false;
  }

  async changeUpline(userId: string, newReferralCode: string): Promise<User> {
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (!user.uplineAgentId) throw new Error("You don't have an agent to change");
    if (!isDormant(user.lastActiveAt, new Date(), user.createdAt)) {
      throw new Error("You can only change agents after 1 year of inactivity");
    }
    const newAgent = await this.getUserByReferralCode(newReferralCode);
    if (!newAgent) throw new Error("No user found for that referral code");
    if (newAgent.id === user.id) throw new Error("You cannot refer yourself");
    if (newAgent.id === user.uplineAgentId) throw new Error("You are already with that agent");
    if (await this.isUpline(user.id, newAgent.id)) {
      throw new Error("That would create a loop in your network");
    }

    const oldAgent = await this.profile(user.uplineAgentId);
    const ts = new Date().toISOString();
    const { error } = await this.db
      .from("pa_profiles")
      .update({ upline_agent_id: newAgent.id, last_active_at: ts })
      .eq("id", user.id);
    if (error) dbError(error);

    await this.addNotification({
      userId: user.id,
      kind: "system",
      title: "Agent changed",
      body: `You're now with ${newAgent.fullName} after a year of inactivity with your previous agent.`,
    });
    if (oldAgent) {
      await this.addNotification({
        userId: oldAgent.id,
        kind: "referral",
        title: "A dormant member left your network",
        body: `${user.fullName} switched to a new agent after 1 year of inactivity.`,
      });
    }
    await this.addNotification({
      userId: newAgent.id,
      kind: "referral",
      title: "New member joined your network",
      body: `${user.fullName} joined your network after leaving a dormant agent relationship.`,
    });

    return (await this.profile(user.id))!;
  }

  async listTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("pa_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) dbError(error);
    return (data as TxRow[]).map(toTx);
  }

  private async insertTx(tx: Transaction): Promise<Transaction> {
    const row = {
      id: tx.id, user_id: tx.userId, counterparty_id: tx.counterpartyId ?? null, type: tx.type,
      amount: tx.amount, currency: tx.currency, status: tx.status, note: tx.note ?? null,
      processed_by: tx.processedBy ?? null, created_at: tx.createdAt,
    };
    const { error } = await this.db.from("pa_transactions").insert(row);
    if (error) dbError(error);
    return tx;
  }

  async recordCash(input: RecordCashInput): Promise<Transaction> {
    const user = await this.profile(input.userId);
    if (!user) throw new Error("User not found");
    if (input.amount <= 0) throw new Error("Amount must be positive");
    const status: Transaction["status"] = input.type === "deposit" ? "pending" : "completed";
    const tx: Transaction = {
      id: this.newId("t"), userId: input.userId, type: input.type, amount: input.amount,
      currency: user.currency, status, note: input.note, createdAt: new Date().toISOString(),
      processedBy: input.processedBy,
    };
    await this.insertTx(tx);
    if (status === "completed") await this.adjustBalance(user.id, input.amount);
    return tx;
  }

  /** Gate for non-admin money movement between two existing users. */
  private async assertTransferAllowed(from: User, to: User): Promise<void> {
    if (from.role === "admin") throw new Error("Admins use Adjust balance, not transfer");
    if (from.role === "agent" && to.role === "player") {
      if (!(await this.isUpline(from.id, to.id))) {
        throw new Error("You can only send chips to players in your own network");
      }
      return;
    }
    if (from.role === "agent" && to.role === "agent") return;
    if (from.role === "player" && to.role === "agent") return;
    if (from.role === "player" && to.role === "player") {
      if (!from.uplineAgentId || from.uplineAgentId !== to.uplineAgentId) {
        throw new Error("Players can only transfer to other players under the same agent");
      }
      return;
    }
    throw new Error("That transfer is not allowed");
  }

  async transfer(input: CreateTransferInput): Promise<{ out: Transaction; in: Transaction }> {
    const from = await this.profile(input.fromUserId);
    if (!from) throw new Error("Sender not found");
    const to = await this.getUserByReferralCode(input.toReferralCode);
    if (!to) throw new Error("No user found for that referral code");
    if (to.id === from.id) throw new Error("Cannot transfer to yourself");
    await this.assertTransferAllowed(from, to);
    if (input.amount <= 0) throw new Error("Amount must be positive");
    // The authoritative balance check happens inside pa_transfer under a row
    // lock; this is just a fast pre-check for a clearer error before we pay
    // for a round trip.
    if (from.balance < input.amount) throw new Error("Insufficient balance");
    const ts = new Date().toISOString();
    const outId = this.newId("t");
    const inId = this.newId("t");
    const { error } = await this.db.rpc("pa_transfer", {
      p_out_tx_id: outId,
      p_in_tx_id: inId,
      p_from_id: from.id,
      p_to_id: to.id,
      p_amount: input.amount,
      p_from_note: input.note ?? `To ${to.username}`,
      p_to_note: input.note ?? `From ${from.username}`,
      p_processed_by: from.id,
      p_created_at: ts,
    });
    if (error) {
      if (error.message === "pa_transfer: insufficient balance") throw new Error("Insufficient balance");
      dbError(error);
    }
    const out: Transaction = {
      id: outId, userId: from.id, counterpartyId: to.id, type: "transfer_out",
      amount: -input.amount, currency: from.currency, status: "completed",
      note: input.note ?? `To ${to.username}`, createdAt: ts, processedBy: from.id,
    };
    const inn: Transaction = {
      id: inId, userId: to.id, counterpartyId: from.id, type: "transfer_in",
      amount: input.amount, currency: to.currency, status: "completed",
      note: input.note ?? `From ${from.username}`, createdAt: ts, processedBy: from.id,
    };
    return { out, in: inn };
  }

  /**
   * Atomically transitions a transaction out of "pending" and, if approved,
   * credits the balance in the same Postgres call — see pa_approve_transaction
   * in supabase/migrations/20260701114746_pokeragent_atomic_money_ops.sql.
   * The `WHERE status = 'pending'` guard inside that function is what stops
   * two concurrent approvals of the same transaction from both crediting.
   */
  async setTransactionStatus(id: string, status: Transaction["status"], processedBy: string): Promise<Transaction> {
    const { data, error } = await this.db
      .rpc("pa_approve_transaction", { p_tx_id: id, p_decision: status, p_processed_by: processedBy })
      .maybeSingle();
    if (error) dbError(error);
    if (!data) throw new Error("Transaction not found");
    const row = data as {
      id: string; user_id: string; counterparty_id: string | null; type: string; amount: number;
      currency: string; status: string; note: string | null; processed_by: string | null;
      created_at: string; applied: boolean;
    };
    // applied=false means pa_approve_transaction's `WHERE status = 'pending'`
    // guard didn't match — the transaction was already decided (by this
    // call or a concurrent one). Throw instead of silently returning the
    // unchanged row as if this decision took effect.
    if (!row.applied) throw new Error("Request already decided");
    return toTx({
      id: row.id, user_id: row.user_id, counterparty_id: row.counterparty_id, type: row.type,
      amount: row.amount, currency: row.currency, status: row.status, note: row.note,
      processed_by: row.processed_by, created_at: row.created_at,
    } as TxRow);
  }

  private async assertUpline(agentId: string, memberId: string): Promise<void> {
    const actor = await this.profile(agentId);
    if (actor?.role === "admin") return;
    if (!(await this.isUpline(agentId, memberId))) {
      throw new Error("Not authorized: that member is not in your network");
    }
  }

  private async isMemberRakebackEligible(member: User): Promise<boolean> {
    const all = await this.allProfiles();
    return isRakebackEligible({
      kycVerified: member.kycStatus === "verified",
      tableHours: member.stats.tableHours,
      directReferrals: all.filter((u) => u.uplineAgentId === member.id).length,
    });
  }

  async creditMember(input: CreditMemberInput): Promise<Transaction> {
    await this.assertUpline(input.agentId, input.memberId);
    const agent = await this.profile(input.agentId);
    if (!agent) throw new Error("Agent not found");
    const member = await this.profile(input.memberId);
    if (!member) throw new Error("Member not found");
    if (input.amount <= 0) throw new Error("Amount must be positive");
    if (input.type === "rake_rebate" && !(await this.isMemberRakebackEligible(member))) {
      throw new Error("This player must verify KYC (Level 1) before they can receive rakeback");
    }
    const ts = new Date().toISOString();
    const debitAgent = agent.role !== "admin";
    if (debitAgent && agent.balance < input.amount) {
      // Fast pre-check for a clearer error; pa_credit_member re-checks under lock.
      throw new Error("Insufficient balance — request credit from admin first");
    }
    const debitTxId = this.newId("t");
    const creditTxId = this.newId("t");
    const { error } = await this.db.rpc("pa_credit_member", {
      p_debit_tx_id: debitTxId,
      p_credit_tx_id: creditTxId,
      p_agent_id: agent.id,
      p_member_id: member.id,
      p_amount: input.amount,
      p_debit_note: input.note ?? `Credit to ${member.username}`,
      p_credit_note: input.note,
      p_tx_type: input.type,
      p_created_at: ts,
      p_debit_agent: debitAgent,
    });
    if (error) {
      if (error.message === "pa_credit_member: insufficient balance") {
        throw new Error("Insufficient balance — request credit from admin first");
      }
      dbError(error);
    }
    const credit: Transaction = {
      id: creditTxId, userId: member.id,
      counterpartyId: debitAgent ? agent.id : undefined,
      type: input.type, amount: input.amount, currency: member.currency, status: "completed",
      note: input.note, createdAt: ts, processedBy: agent.id,
    };
    return credit;
  }

  async setPlayerCreditLimit(actorId: string, playerId: string, creditLimit: number): Promise<User> {
    const actor = await this.profile(actorId);
    if (!actor) throw new Error("User not found");
    const player = await this.profile(playerId);
    if (!player) throw new Error("Player not found");
    if (creditLimit < 0) throw new Error("Credit limit cannot be negative");
    const isAdmin = actor.role === "admin";
    if (!isAdmin && player.uplineAgentId !== actorId) {
      throw new Error("You can only set credit limits for your own players");
    }
    // Fast pre-checks for a clear error before the round trip; pa_set_credit_limit
    // re-checks both under row locks (fixes a real race the pre-checks alone can't).
    if (player.balance < -creditLimit) {
      throw new Error(`${player.fullName} currently owes ${formatMoney(-player.balance, player.currency)} — you can't set the limit below that`);
    }
    const { error } = await this.db.rpc("pa_set_credit_limit", {
      p_actor_id: actorId,
      p_player_id: playerId,
      p_credit_limit: creditLimit,
      p_is_admin: isAdmin,
    });
    if (error) {
      if (error.message === "pa_set_credit_limit: aggregate cap exceeded") {
        throw new Error("Total credit limits would exceed your balance");
      }
      if (error.message === "pa_set_credit_limit: balance floor") {
        throw new Error(`${player.fullName} currently owes ${formatMoney(-player.balance, player.currency)} — you can't set the limit below that`);
      }
      dbError(error);
    }
    return (await this.profile(playerId))!;
  }

  async setMemberTableHours(agentId: string, memberId: string, hours: number): Promise<User> {
    await this.assertUpline(agentId, memberId);
    if (hours < 0) throw new Error("Hours cannot be negative");
    const { error } = await this.db.from("pa_profiles").update({ table_hours: hours }).eq("id", memberId);
    if (error) dbError(error);
    return (await this.profile(memberId))!;
  }

  async requestAgentStatus(userId: string): Promise<User> {
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "player") throw new Error("Only players can request agent status");
    // Mirrors the dashboard's "Path to Agent" gate (agentProgress) — without
    // this, any player could bypass the UI and request agent status with 0
    // qualifying VIP referrals.
    const { vipNetworkCount } = await this.getNetworkSummary(userId);
    if (!agentProgress({ vipNetworkCount }).eligible) {
      throw new Error(`You need at least ${AGENT_MIN_VIP_NETWORK} VIP players in your network to request agent status`);
    }
    const { error } = await this.db.from("pa_profiles").update({ agent_request: "pending" }).eq("id", userId);
    if (error) dbError(error);
    return (await this.profile(userId))!;
  }

  async decideAgentRequest(adminId: string, userId: string, decision: "approved" | "rejected"): Promise<User> {
    await this.assertAdmin(adminId);
    if (decision === "approved") {
      // Provisional rate from the live VIP count so a brand-new agent isn't
      // stuck at 0% until the next monthly recalculation locks in the real,
      // qualified rate.
      const all = await this.allProfiles();
      const user = all.find((u) => u.id === userId);
      const vipCount = user
        ? flattenOwnBusiness(nodeOf(user, all)).filter((n) => memberStatus(levelInputsFor(n)) === "vip_player").length
        : 0;
      const rate = rakebackRateForTier(AGENT_RAKEBACK_TIERS, vipCount);
      const { error } = await this.db
        .from("pa_profiles")
        .update({
          role: "agent",
          agent_request: "none",
          current_rakeback_rate: rate,
          rakeback_tier_as_of: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) dbError(error);
    } else {
      const { error } = await this.db.from("pa_profiles").update({ agent_request: "rejected" }).eq("id", userId);
      if (error) dbError(error);
    }
    return (await this.profile(userId))!;
  }

  async listAgentRequests(): Promise<User[]> {
    const { data, error } = await this.db
      .from("pa_profiles").select(SupabaseRepository.PROFILE_COLUMNS).eq("agent_request", "pending");
    if (error) dbError(error);
    return (data as unknown as ProfileRow[]).map(toUser);
  }

  async decideMemberTransaction(agentId: string, txId: string, status: "approved" | "rejected"): Promise<Transaction> {
    const { data, error } = await this.db.from("pa_transactions").select("user_id").eq("id", txId).maybeSingle();
    if (error) dbError(error);
    if (!data) throw new Error("Transaction not found");
    await this.assertUpline(agentId, (data as { user_id: string }).user_id);
    return this.setTransactionStatus(txId, status, agentId);
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await this.db
      .from("pa_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) dbError(error);
    return (data as NotifRow[]).map(toNotif);
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("pa_notifications").update({ read: true }).eq("id", id).eq("user_id", userId);
    if (error) dbError(error);
  }

  async addNotification(input: Omit<Notification, "id" | "read" | "createdAt">): Promise<Notification> {
    const n: Notification = { ...input, id: this.newId("n"), read: false, createdAt: new Date().toISOString() };
    const { error } = await this.db.from("pa_notifications").insert({
      id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, read: false, created_at: n.createdAt,
    });
    if (error) dbError(error);
    return n;
  }

  // --- agent credit / settlement -------------------------------------------
  async requestAgentCredit(agentId: string, amount: number, note?: string): Promise<Transaction> {
    const agent = await this.profile(agentId);
    if (!agent) throw new Error("User not found");
    if (agent.role !== "agent") throw new Error("Only agents can request credit");
    if (amount <= 0) throw new Error("Amount must be positive");
    if (agent.balance < 0) throw new Error("Your balance is negative — settle it before requesting credit");
    const tx: Transaction = {
      id: this.newId("t"), userId: agentId, type: "agent_credit", amount,
      currency: agent.currency, status: "pending", note, createdAt: new Date().toISOString(),
    };
    await this.insertTx(tx);
    return tx;
  }

  async decideAgentCredit(adminId: string, txId: string, decision: "approved" | "rejected"): Promise<Transaction> {
    await this.assertAdmin(adminId);
    const { data, error } = await this.db.from("pa_transactions").select("*").eq("id", txId).maybeSingle();
    if (error) dbError(error);
    if (!data) throw new Error("Transaction not found");
    const tx = toTx(data as TxRow);
    if (tx.type !== "agent_credit") throw new Error("Not a credit request");
    if (tx.status !== "pending") throw new Error("Request already decided");
    return this.setTransactionStatus(txId, decision, adminId);
  }

  async listAgentCreditRequests(): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("pa_transactions").select("*").eq("type", "agent_credit").eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) dbError(error);
    return (data as TxRow[]).map(toTx);
  }

  async listSettlements(): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("pa_transactions").select("*").eq("type", "agent_credit").order("created_at", { ascending: false });
    if (error) dbError(error);
    return (data as TxRow[]).map(toTx);
  }

  async sweepNegativeBalances(): Promise<SweepResult[]> {
    const all = await this.allProfiles();
    const byId = new Map(all.map((u) => [u.id, u]));
    const results: SweepResult[] = [];
    const ts = new Date().toISOString();
    for (const player of all) {
      if (player.role !== "player" || player.balance >= 0 || !player.uplineAgentId) continue;
      const agent = byId.get(player.uplineAgentId);
      if (!agent) continue;
      // pa_sweep_negative_balance re-checks the player's balance under a row
      // lock at execution time (not this stale snapshot) and returns null if
      // there's nothing left to sweep, so a concurrent credit landing between
      // this read and the sweep can't get clobbered.
      const { data: swept, error } = await this.db.rpc("pa_sweep_negative_balance", {
        p_player_id: player.id,
        p_agent_id: agent.id,
      });
      if (error) dbError(error);
      if (swept === null || swept === undefined) continue;
      const amount = swept as number;
      await this.insertTx({
        id: this.newId("t"), userId: player.id, counterpartyId: agent.id, type: "adjustment",
        amount, currency: player.currency, status: "completed",
        note: "Negative balance settled by agent", createdAt: ts, processedBy: agent.id,
      });
      await this.insertTx({
        id: this.newId("t"), userId: agent.id, counterpartyId: player.id, type: "adjustment",
        amount: -amount, currency: agent.currency, status: "completed",
        note: `Absorbed ${player.username}'s negative balance`, createdAt: ts, processedBy: agent.id,
      });
      const agentAfter = await this.profile(agent.id);
      const agentNewBalance = agentAfter?.balance ?? agent.balance - amount;
      results.push({ playerId: player.id, agentId: agent.id, amount, agentNowNegative: agentNewBalance < 0 });
    }
    return results;
  }

  // --- ClubGG stats import -------------------------------------------------
  /** Build the distribution plan from CURRENT state (all reads, no mutation). */
  private async buildStatsImportPlan(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    await this.assertAdmin(adminId);
    const users = await this.allProfiles();
    const byId = new Map(users.map((u) => [u.id, u]));
    const childCount = new Map<string, number>();
    for (const u of users) {
      if (u.uplineAgentId) childCount.set(u.uplineAgentId, (childCount.get(u.uplineAgentId) ?? 0) + 1);
    }
    const levelInputs = (u: User) => ({
      kycVerified: u.kycStatus === "verified",
      tableHours: u.stats.tableHours,
      directReferrals: childCount.get(u.id) ?? 0,
    });
    const membersByClubId = new Map<string, DistributionMember>();
    const eligibleIds = new Set<string>();
    for (const u of users) {
      if (u.clubggId) membersByClubId.set(u.clubggId, { id: u.id, username: u.username });
      if (isRakebackEligible(levelInputs(u))) eligibleIds.add(u.id);
    }
    const agentChainOf = (userId: string): string[] => {
      const chain: string[] = [];
      let cur = byId.get(userId)?.uplineAgentId ?? null;
      let guard = 0;
      while (cur && guard++ < 100) {
        const u = byId.get(cur);
        if (!u || u.role === "admin") break; // reached the platform root
        if (u.role === "agent") chain.push(u.id);
        cur = u.uplineAgentId ?? null;
      }
      return chain;
    };
    const rateByAgent = new Map<string, number>();
    const nameByAgent = new Map<string, string>();
    for (const u of users) {
      if (u.role !== "agent") continue;
      nameByAgent.set(u.id, u.username);
      rateByAgent.set(u.id, (await this.getNetworkSummary(u.id)).commissionRate);
    }
    return planDistribution(rows, {
      playerRakebackRate: CLUB.playerRakebackRate,
      membersByClubId,
      rakebackEligible: (id) => eligibleIds.has(id),
      agentChainOf,
      agentRate: (id) => rateByAgent.get(id) ?? 0,
      agentUsername: (id) => nameByAgent.get(id) ?? id,
    });
  }

  async previewStatsImport(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    return this.buildStatsImportPlan(adminId, rows);
  }

  async applyStatsImport(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    const plan = await this.buildStatsImportPlan(adminId, rows);
    const ts = new Date().toISOString();

    // 1) Stat deltas (direct update) + personal rakeback (atomic credit).
    for (const line of plan.lines) {
      if (!line.matched || !line.userId) continue;
      const user = await this.profile(line.userId);
      if (!user) continue;
      const s = user.stats;
      const { error } = await this.db
        .from("pa_profiles")
        .update({
          hands_played: s.handsPlayed + line.handsPlayed,
          table_hours: s.tableHours + line.tableHours,
          rake_generated: s.rakeGenerated + line.rake,
          net_profit: s.netProfit + line.netProfit,
          sessions: s.sessions + (line.handsPlayed > 0 ? 1 : 0),
        })
        .eq("id", user.id);
      if (error) dbError(error);
      if (line.playerRakeback > 0) {
        await this.insertTx({
          id: this.newId("t"), userId: user.id, type: "rake_rebate", amount: line.playerRakeback,
          currency: user.currency, status: "completed", note: "ClubGG rakeback", createdAt: ts, processedBy: adminId,
        });
        await this.adjustBalance(user.id, line.playerRakeback);
      }
    }

    // 2) Agent settlements (admin → agent).
    for (const st of plan.settlements) {
      const agent = await this.profile(st.agentId);
      if (!agent) continue;
      await this.insertTx({
        id: this.newId("t"), userId: agent.id, type: "agent_credit", amount: st.commission,
        currency: agent.currency, status: "completed",
        note: "ClubGG rake settlement", createdAt: ts, processedBy: adminId,
      });
      await this.adjustBalance(agent.id, st.commission);
      await this.addNotification({
        userId: agent.id, kind: "money", title: "Rake settlement paid",
        body: `You earned ${formatMoney(st.commission, agent.currency)} override commission from your network's rake.`,
      });
    }

    return plan;
  }

  // --- monthly rakeback tier recalculation ----------------------------------
  async recalculateMonthlyRakebackTiers(): Promise<RakebackTierChange[]> {
    const all = await this.allProfiles();
    const ts = new Date().toISOString();
    // Idempotency guard: a retried/duplicate cron delivery on the same day
    // must not re-run this — it would reset the hours baseline twice and
    // silently zero out agents' qualifying VIP counts. Day precision (not
    // month) is deliberate: decideAgentRequest also stamps rakebackTierAsOf
    // when granting a brand-new agent's provisional rate, so a month-wide
    // check would treat "someone was approved this month" as "the monthly
    // cron already ran this month" and silently suppress the real run for
    // every other agent — day precision only blocks a same-day retry.
    const todayKey = ts.slice(0, 10);
    if (all.some((u) => u.role === "agent" && u.rakebackTierAsOf?.slice(0, 10) === todayKey)) {
      return [];
    }
    const qualifies = (n: NetworkNode): boolean => {
      const played = n.user.stats.tableHours - (n.user.stats.lastMonthlySnapshotHours ?? 0);
      if (played < AGENT_MIN_MONTHLY_HOURS) return false;
      return memberStatus(levelInputsFor(n)) === "vip_player";
    };

    const results: RakebackTierChange[] = [];
    for (const agent of all.filter((u) => u.role === "agent")) {
      const qualifiedVipCount = flattenOwnBusiness(nodeOf(agent, all)).filter(qualifies).length;
      const newRate = rakebackRateForTier(AGENT_RAKEBACK_TIERS, qualifiedVipCount);
      results.push({
        agentId: agent.id,
        previousRate: agent.currentRakebackRate ?? 0,
        newRate,
        qualifiedVipCount,
      });
      const { error } = await this.db
        .from("pa_profiles")
        .update({ current_rakeback_rate: newRate, rakeback_tier_as_of: ts })
        .eq("id", agent.id);
      if (error) dbError(error);
    }

    // Reset the hours baseline for EVERY user (not just agents' downlines)
    // so next month's delta is correct platform-wide.
    for (const u of all) {
      const { error } = await this.db
        .from("pa_profiles")
        .update({ last_monthly_snapshot_hours: u.stats.tableHours })
        .eq("id", u.id);
      if (error) dbError(error);
    }
    return results;
  }

  async getAdminOverview(): Promise<AdminOverview> {
    const users = await this.allProfiles();
    const pendingTx = await this.listPendingTransactions();
    return {
      totalUsers: users.length,
      totalAgents: users.filter((u) => u.role === "agent").length,
      totalPlayers: users.filter((u) => u.role === "player").length,
      pendingKyc: users.filter((u) => u.kycStatus === "pending").length,
      pendingTransactions: pendingTx.length,
      totalBalance: users.reduce((s, u) => s + u.balance, 0),
      platformRake: users.reduce((s, u) => s + u.stats.rakeGenerated, 0),
      currency: "USD",
    };
  }

  async listPendingTransactions(): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("pa_transactions").select("*").eq("status", "pending").neq("type", "agent_credit")
      .order("created_at", { ascending: false });
    if (error) dbError(error);
    return (data as TxRow[]).map(toTx);
  }

  private async assertAdmin(adminId: string): Promise<void> {
    const actor = await this.profile(adminId);
    if (actor?.role !== "admin") throw new Error("Not authorized: admin only");
  }

  async createMember(adminId: string, input: CreateMemberInput): Promise<User> {
    await this.assertAdmin(adminId);
    const { data: dup } = await this.db
      .from("pa_profiles").select("id").ilike("username", input.username.trim()).maybeSingle();
    if (dup) throw new Error(`Username "${input.username}" already exists`);
    let uplineId: string | null = null;
    if (input.uplineReferralCode) {
      const upline = await this.getUserByReferralCode(input.uplineReferralCode);
      if (!upline) throw new Error(`Unknown upline code "${input.uplineReferralCode}"`);
      uplineId = upline.id;
    }
    // New members are always players; agent status comes via request → approval.
    const member = buildNewMember({ ...input, role: "player" }, this.newId("u"), uplineId, crypto.randomUUID());
    const { error } = await this.db.from("pa_profiles").insert({
      id: member.id, username: member.username, full_name: member.fullName, email: member.email,
      role: member.role, status: member.status, kyc_status: member.kycStatus,
      upline_agent_id: member.uplineAgentId, referral_code: member.referralCode,
      clubgg_id: member.clubggId ?? null, clubgg_nickname: member.clubggNickname ?? null,
      agent_request: "none", balance: member.balance, currency: member.currency,
      table_hours: 0, created_at: member.createdAt,
    });
    if (error) dbError(error);
    return member;
  }

  async setKycStatus(adminId: string, userId: string, status: KycStatus): Promise<User> {
    await this.assertAdmin(adminId);
    const { error } = await this.db.from("pa_profiles").update({ kyc_status: status }).eq("id", userId);
    if (error) dbError(error);
    return (await this.profile(userId))!;
  }

  async setAccountStatus(adminId: string, userId: string, status: AccountStatus): Promise<User> {
    await this.assertAdmin(adminId);
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (user.role === "admin") throw new Error("Cannot change an admin's account status");
    const { error } = await this.db.from("pa_profiles").update({ status }).eq("id", userId);
    if (error) dbError(error);
    return (await this.profile(userId))!;
  }

  async setUserRole(adminId: string, userId: string, role: Role): Promise<User> {
    await this.assertAdmin(adminId);
    if (userId === adminId) throw new Error("Cannot change your own role");
    const target = await this.profile(userId);
    if (!target) throw new Error("User not found");
    if (role === "admin" && !isAdminEmail(target.email)) {
      throw new Error(`Only ${ADMIN_EMAIL} can be admin`);
    }
    if (isAdminEmail(target.email) && role !== "admin") {
      throw new Error("The platform admin cannot be demoted");
    }
    const { error } = await this.db.from("pa_profiles").update({ role }).eq("id", userId);
    if (error) dbError(error);
    return (await this.profile(userId))!;
  }

  async adminAdjustBalance(adminId: string, userId: string, amount: number, note?: string): Promise<Transaction> {
    await this.assertAdmin(adminId);
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (amount === 0) throw new Error("Adjustment cannot be zero");
    const tx: Transaction = {
      id: this.newId("t"), userId, type: "adjustment", amount, currency: user.currency,
      status: "completed", note: note ?? "Admin adjustment", createdAt: new Date().toISOString(), processedBy: adminId,
    };
    await this.insertTx(tx);
    await this.adjustBalance(userId, amount);
    return tx;
  }
}
