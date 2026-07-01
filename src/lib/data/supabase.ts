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
  RecordCashInput,
  Repository,
  SweepResult,
} from "./repository";
import { AGENT_COMMISSION_RATE } from "./memory";
import { buildNewMember } from "./newMember";
import { ADMIN_EMAIL, isAdminEmail } from "@/lib/governance";
import { isRakebackEligible, canEarnReferrals } from "@/lib/levels";
import { isDormant } from "@/lib/activity";

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
    stats: {
      handsPlayed: r.hands_played,
      netProfit: r.net_profit,
      rakeGenerated: r.rake_generated,
      winRateBb100: Number(r.win_rate_bb100),
      sessions: r.sessions,
      tableHours: Number(r.table_hours),
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

  private async allProfiles(): Promise<User[]> {
    const { data, error } = await this.db.from("pa_profiles").select("*");
    if (error) throw new Error(error.message);
    return (data as ProfileRow[]).map(toUser);
  }

  private async profile(id: string): Promise<User | null> {
    const { data, error } = await this.db.from("pa_profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toUser(data as ProfileRow) : null;
  }

  private async setBalance(id: string, balance: number): Promise<void> {
    const { error } = await this.db.from("pa_profiles").update({ balance }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  private newId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  async findAuthByEmail(email: string): Promise<AuthCredential | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select("id, password_hash").ilike("email", email.trim()).maybeSingle();
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return member;
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const { error } = await this.db.from("pa_profiles").update({ password_hash: passwordHash }).eq("id", userId);
    if (error) throw new Error(error.message);
  }

  async getUser(id: string): Promise<User | null> {
    return this.profile(id);
  }

  async getUserByReferralCode(code: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select("*").ilike("referral_code", code.trim()).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toUser(data as ProfileRow) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select("*").ilike("email", email.trim()).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toUser(data as ProfileRow) : null;
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
    const flat: User[] = [];
    const walk = (id: string) => {
      for (const c of all.filter((u) => u.uplineAgentId === id)) { flat.push(c); walk(c.id); }
    };
    if (root) walk(root.id);
    // L0 (not yet KYC-verified) players can play, but their rake doesn't
    // count toward the agent's commission until they reach L1.
    const rakebackEligible = flat.filter((u) =>
      isRakebackEligible({
        kycVerified: u.kycStatus === "verified",
        tableHours: u.stats.tableHours,
        directReferrals: all.filter((x) => x.uplineAgentId === u.id).length,
      }),
    );
    const networkRake = rakebackEligible.reduce((s, u) => s + u.stats.rakeGenerated, 0);
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
    return {
      directReferrals: root ? all.filter((u) => u.uplineAgentId === root.id).length : 0,
      totalNetwork: flat.length,
      activePlayers: flat.filter((u) => u.stats.handsPlayed > 0).length,
      networkRake,
      commissionEarned: frozen || !selfEarns ? 0 : Math.round(networkRake * AGENT_COMMISSION_RATE),
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
    if (error) throw new Error(error.message);

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
    if (error) throw new Error(error.message);
    return (data as TxRow[]).map(toTx);
  }

  private async insertTx(tx: Transaction): Promise<Transaction> {
    const row = {
      id: tx.id, user_id: tx.userId, counterparty_id: tx.counterpartyId ?? null, type: tx.type,
      amount: tx.amount, currency: tx.currency, status: tx.status, note: tx.note ?? null,
      processed_by: tx.processedBy ?? null, created_at: tx.createdAt,
    };
    const { error } = await this.db.from("pa_transactions").insert(row);
    if (error) throw new Error(error.message);
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
    if (status === "completed") await this.setBalance(user.id, user.balance + input.amount);
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
    if (from.balance < input.amount) throw new Error("Insufficient balance");
    const ts = new Date().toISOString();
    const out: Transaction = {
      id: this.newId("t"), userId: from.id, counterpartyId: to.id, type: "transfer_out",
      amount: -input.amount, currency: from.currency, status: "completed",
      note: input.note ?? `To ${to.username}`, createdAt: ts, processedBy: from.id,
    };
    const inn: Transaction = {
      id: this.newId("t"), userId: to.id, counterpartyId: from.id, type: "transfer_in",
      amount: input.amount, currency: to.currency, status: "completed",
      note: input.note ?? `From ${from.username}`, createdAt: ts, processedBy: from.id,
    };
    await this.insertTx(out);
    await this.insertTx(inn);
    await this.setBalance(from.id, from.balance - input.amount);
    await this.setBalance(to.id, to.balance + input.amount);
    return { out, in: inn };
  }

  async setTransactionStatus(id: string, status: Transaction["status"], processedBy: string): Promise<Transaction> {
    const { data, error } = await this.db.from("pa_transactions").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Transaction not found");
    const tx = toTx(data as TxRow);
    const wasPending = tx.status === "pending";
    const finalStatus = status === "approved" ? "completed" : status;
    const { error: upErr } = await this.db
      .from("pa_transactions").update({ status: finalStatus, processed_by: processedBy }).eq("id", id);
    if (upErr) throw new Error(upErr.message);
    if (wasPending && (status === "approved" || status === "completed")) {
      const user = await this.profile(tx.userId);
      if (user) await this.setBalance(user.id, user.balance + tx.amount);
    }
    return { ...tx, status: finalStatus, processedBy };
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
    if (agent.role !== "admin") {
      if (agent.balance < input.amount) {
        throw new Error("Insufficient balance — request credit from admin first");
      }
      await this.insertTx({
        id: this.newId("t"), userId: agent.id, counterpartyId: member.id, type: "transfer_out",
        amount: -input.amount, currency: agent.currency, status: "completed",
        note: input.note ?? `Credit to ${member.username}`, createdAt: ts, processedBy: agent.id,
      });
      await this.setBalance(agent.id, agent.balance - input.amount);
    }
    const credit: Transaction = {
      id: this.newId("t"), userId: member.id,
      counterpartyId: agent.role !== "admin" ? agent.id : undefined,
      type: input.type, amount: input.amount, currency: member.currency, status: "completed",
      note: input.note, createdAt: ts, processedBy: agent.id,
    };
    await this.insertTx(credit);
    await this.setBalance(member.id, member.balance + input.amount);
    return credit;
  }

  async setPlayerCreditLimit(actorId: string, playerId: string, creditLimit: number): Promise<User> {
    const actor = await this.profile(actorId);
    if (!actor) throw new Error("User not found");
    const player = await this.profile(playerId);
    if (!player) throw new Error("Player not found");
    if (creditLimit < 0) throw new Error("Credit limit cannot be negative");
    if (actor.role !== "admin") {
      if (player.uplineAgentId !== actorId) {
        throw new Error("You can only set credit limits for your own players");
      }
      const all = await this.allProfiles();
      const others = all
        .filter((u) => u.uplineAgentId === actorId && u.id !== playerId)
        .reduce((s, u) => s + (u.creditLimit ?? 0), 0);
      if (others + creditLimit > actor.balance) {
        throw new Error("Total credit limits would exceed your balance");
      }
    }
    const { error } = await this.db.from("pa_profiles").update({ credit_limit: creditLimit }).eq("id", playerId);
    if (error) throw new Error(error.message);
    return (await this.profile(playerId))!;
  }

  async setMemberTableHours(agentId: string, memberId: string, hours: number): Promise<User> {
    await this.assertUpline(agentId, memberId);
    if (hours < 0) throw new Error("Hours cannot be negative");
    const { error } = await this.db.from("pa_profiles").update({ table_hours: hours }).eq("id", memberId);
    if (error) throw new Error(error.message);
    return (await this.profile(memberId))!;
  }

  async requestAgentStatus(userId: string): Promise<User> {
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "player") throw new Error("Only players can request agent status");
    const { error } = await this.db.from("pa_profiles").update({ agent_request: "pending" }).eq("id", userId);
    if (error) throw new Error(error.message);
    return (await this.profile(userId))!;
  }

  async decideAgentRequest(adminId: string, userId: string, decision: "approved" | "rejected"): Promise<User> {
    await this.assertAdmin(adminId);
    const patch = decision === "approved" ? { role: "agent", agent_request: "none" } : { agent_request: "rejected" };
    const { error } = await this.db.from("pa_profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return (await this.profile(userId))!;
  }

  async listAgentRequests(): Promise<User[]> {
    const { data, error } = await this.db.from("pa_profiles").select("*").eq("agent_request", "pending");
    if (error) throw new Error(error.message);
    return (data as ProfileRow[]).map(toUser);
  }

  async decideMemberTransaction(agentId: string, txId: string, status: "approved" | "rejected"): Promise<Transaction> {
    const { data, error } = await this.db.from("pa_transactions").select("user_id").eq("id", txId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Transaction not found");
    await this.assertUpline(agentId, (data as { user_id: string }).user_id);
    return this.setTransactionStatus(txId, status, agentId);
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await this.db
      .from("pa_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as NotifRow[]).map(toNotif);
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await this.db.from("pa_notifications").update({ read: true }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addNotification(input: Omit<Notification, "id" | "read" | "createdAt">): Promise<Notification> {
    const n: Notification = { ...input, id: this.newId("n"), read: false, createdAt: new Date().toISOString() };
    const { error } = await this.db.from("pa_notifications").insert({
      id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, read: false, created_at: n.createdAt,
    });
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return (data as TxRow[]).map(toTx);
  }

  async listSettlements(): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("pa_transactions").select("*").eq("type", "agent_credit").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
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
      const amount = -player.balance;
      await this.insertTx({
        id: this.newId("t"), userId: player.id, counterpartyId: agent.id, type: "adjustment",
        amount, currency: player.currency, status: "completed",
        note: "Negative balance settled by agent", createdAt: ts, processedBy: agent.id,
      });
      await this.setBalance(player.id, 0);
      await this.insertTx({
        id: this.newId("t"), userId: agent.id, counterpartyId: player.id, type: "adjustment",
        amount: -amount, currency: agent.currency, status: "completed",
        note: `Absorbed ${player.username}'s negative balance`, createdAt: ts, processedBy: agent.id,
      });
      const agentNewBalance = agent.balance - amount;
      await this.setBalance(agent.id, agentNewBalance);
      agent.balance = agentNewBalance; // keep local map in sync for multi-player agents
      results.push({ playerId: player.id, agentId: agent.id, amount, agentNowNegative: agentNewBalance < 0 });
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return member;
  }

  async setKycStatus(adminId: string, userId: string, status: KycStatus): Promise<User> {
    await this.assertAdmin(adminId);
    const { error } = await this.db.from("pa_profiles").update({ kyc_status: status }).eq("id", userId);
    if (error) throw new Error(error.message);
    return (await this.profile(userId))!;
  }

  async setAccountStatus(adminId: string, userId: string, status: AccountStatus): Promise<User> {
    await this.assertAdmin(adminId);
    const user = await this.profile(userId);
    if (!user) throw new Error("User not found");
    if (user.role === "admin") throw new Error("Cannot change an admin's account status");
    const { error } = await this.db.from("pa_profiles").update({ status }).eq("id", userId);
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
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
    await this.setBalance(userId, user.balance + amount);
    return tx;
  }
}
