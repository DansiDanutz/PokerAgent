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
  CreateMemberInput,
  CreateTransferInput,
  CreditMemberInput,
  RecordCashInput,
  Repository,
} from "./repository";
import { AGENT_COMMISSION_RATE } from "./memory";
import { buildNewMember } from "./newMember";
import { ADMIN_EMAIL, isAdminEmail } from "@/lib/governance";

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

  async getUser(id: string): Promise<User | null> {
    return this.profile(id);
  }

  async getUserByReferralCode(code: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("pa_profiles").select("*").ilike("referral_code", code.trim()).maybeSingle();
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
    const networkRake = flat.reduce((s, u) => s + u.stats.rakeGenerated, 0);
    return {
      directReferrals: root ? all.filter((u) => u.uplineAgentId === root.id).length : 0,
      totalNetwork: flat.length,
      activePlayers: flat.filter((u) => u.stats.handsPlayed > 0).length,
      networkRake,
      commissionEarned: Math.round(networkRake * AGENT_COMMISSION_RATE),
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
    const signed = input.type === "withdrawal" ? -input.amount : input.amount;
    const status: Transaction["status"] =
      input.type === "deposit" || input.type === "withdrawal" ? "pending" : "completed";
    const tx: Transaction = {
      id: this.newId("t"), userId: input.userId, type: input.type, amount: signed,
      currency: user.currency, status, note: input.note, createdAt: new Date().toISOString(),
      processedBy: input.processedBy,
    };
    await this.insertTx(tx);
    if (status === "completed") await this.setBalance(user.id, user.balance + signed);
    return tx;
  }

  async transfer(input: CreateTransferInput): Promise<{ out: Transaction; in: Transaction }> {
    const from = await this.profile(input.fromUserId);
    if (!from) throw new Error("Sender not found");
    const to = await this.getUserByReferralCode(input.toReferralCode);
    if (!to) throw new Error("No user found for that referral code");
    if (to.id === from.id) throw new Error("Cannot transfer to yourself");
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

  async creditMember(input: CreditMemberInput): Promise<Transaction> {
    await this.assertUpline(input.agentId, input.memberId);
    return this.recordCash({
      userId: input.memberId, type: input.type, amount: input.amount, note: input.note, processedBy: input.agentId,
    });
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
      .from("pa_transactions").select("*").eq("status", "pending").order("created_at", { ascending: false });
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
