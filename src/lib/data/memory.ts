/**
 * In-memory repository backed by the seed data. This is the default driver so
 * the app runs with zero external setup. State is process-local and resets on
 * restart — perfect for demos, tests and local development.
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
} from "./repository";
import { buildNewMember } from "./newMember";
import { ADMIN_EMAIL, isAdminEmail } from "@/lib/governance";
import { SEED_NOTIFICATIONS, SEED_PASSWORD_HASH, SEED_TRANSACTIONS, SEED_USERS } from "./seed";

/** Agent commission as a fraction of downline rake (illustrative default). */
export const AGENT_COMMISSION_RATE = 0.2;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryRepository implements Repository {
  private users: Map<string, User>;
  private transactions: Transaction[];
  private notifications: Notification[];
  private passwords: Map<string, string>;
  private seq = 1000;

  constructor() {
    this.users = new Map(clone(SEED_USERS).map((u) => [u.id, u]));
    this.transactions = clone(SEED_TRANSACTIONS);
    this.notifications = clone(SEED_NOTIFICATIONS);
    // Every seeded account shares the demo password.
    this.passwords = new Map(SEED_USERS.map((u) => [u.id, SEED_PASSWORD_HASH]));
  }

  async findAuthByEmail(email: string): Promise<AuthCredential | null> {
    const norm = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === norm) {
        const passwordHash = this.passwords.get(u.id);
        if (passwordHash) return { id: u.id, passwordHash };
      }
    }
    return null;
  }

  async createAccount(input: CreateAccountInput): Promise<User> {
    const existing = [...this.users.values()];
    if (existing.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new Error("An account with that email already exists");
    }
    if (existing.some((u) => u.username.toLowerCase() === input.username.trim().toLowerCase())) {
      throw new Error("That username is taken");
    }
    let uplineId: string | null = null;
    if (input.uplineReferralCode) {
      const upline = await this.getUserByReferralCode(input.uplineReferralCode);
      if (upline) uplineId = upline.id;
    }
    const member = buildNewMember(
      { username: input.username, fullName: input.fullName, email: input.email, role: "player" },
      this.id("u"),
      uplineId,
      String(this.seq),
    );
    this.users.set(member.id, member);
    this.passwords.set(member.id, input.passwordHash);
    return clone(member);
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    if (!this.users.has(userId)) throw new Error("User not found");
    this.passwords.set(userId, passwordHash);
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  async getUser(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? clone(u) : null;
  }

  async getUserByReferralCode(code: string): Promise<User | null> {
    const norm = code.trim().toUpperCase();
    for (const u of this.users.values()) {
      if (u.referralCode.toUpperCase() === norm) return clone(u);
    }
    return null;
  }

  async listUsers(filter?: { role?: Role; q?: string }): Promise<User[]> {
    let list = [...this.users.values()];
    if (filter?.role) list = list.filter((u) => u.role === filter.role);
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    return clone(list.sort((a, b) => a.fullName.localeCompare(b.fullName)));
  }

  private childrenOf(agentId: string): User[] {
    return [...this.users.values()].filter((u) => u.uplineAgentId === agentId);
  }

  private buildNode(user: User): NetworkNode {
    const children = this.childrenOf(user.id).map((c) => this.buildNode(c));
    const subtreeSize =
      children.length + children.reduce((s, c) => s + c.subtreeSize, 0);
    const subtreeRake =
      user.stats.rakeGenerated +
      children.reduce((s, c) => s + c.subtreeRake, 0);
    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        balance: user.balance,
        currency: user.currency,
        stats: user.stats,
        kycStatus: user.kycStatus,
      },
      children,
      subtreeSize,
      subtreeRake,
    };
  }

  async getNetworkTree(agentId: string): Promise<NetworkNode | null> {
    const agent = this.users.get(agentId);
    if (!agent) return null;
    return clone(this.buildNode(agent));
  }

  async getNetworkSummary(agentId: string): Promise<NetworkSummary> {
    const agent = this.users.get(agentId);
    const node = agent ? this.buildNode(agent) : null;
    const flat: NetworkNode[] = [];
    const walk = (n: NetworkNode) => {
      n.children.forEach((c) => {
        flat.push(c);
        walk(c);
      });
    };
    if (node) walk(node);
    const networkRake = flat.reduce((s, n) => s + n.user.stats.rakeGenerated, 0);
    return {
      directReferrals: node ? node.children.length : 0,
      totalNetwork: flat.length,
      activePlayers: flat.filter((n) => n.user.stats.handsPlayed > 0).length,
      networkRake,
      commissionEarned: Math.round(networkRake * AGENT_COMMISSION_RATE),
      currency: agent?.currency ?? "USD",
    };
  }

  async listDownline(agentId: string): Promise<User[]> {
    const result: User[] = [];
    const walk = (parentId: string) => {
      for (const child of this.childrenOf(parentId)) {
        result.push(child);
        walk(child.id);
      }
    };
    walk(agentId);
    return clone(result);
  }

  async isUpline(agentId: string, userId: string): Promise<boolean> {
    let cur = this.users.get(userId)?.uplineAgentId ?? null;
    let guard = 0;
    while (cur && guard < 50) {
      if (cur === agentId) return true;
      cur = this.users.get(cur)?.uplineAgentId ?? null;
      guard += 1;
    }
    return false;
  }

  private async assertUpline(agentId: string, memberId: string): Promise<void> {
    // Admins may manage anyone; agents only their own downline.
    if (this.users.get(agentId)?.role === "admin") return;
    if (!(await this.isUpline(agentId, memberId))) {
      throw new Error("Not authorized: that member is not in your network");
    }
  }

  async creditMember(input: CreditMemberInput): Promise<Transaction> {
    await this.assertUpline(input.agentId, input.memberId);
    return this.recordCash({
      userId: input.memberId,
      type: input.type,
      amount: input.amount,
      note: input.note,
      processedBy: input.agentId,
    });
  }

  async setMemberTableHours(agentId: string, memberId: string, hours: number): Promise<User> {
    await this.assertUpline(agentId, memberId);
    if (hours < 0) throw new Error("Hours cannot be negative");
    const member = this.users.get(memberId)!;
    member.stats = { ...member.stats, tableHours: hours };
    return clone(member);
  }

  async requestAgentStatus(userId: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "player") throw new Error("Only players can request agent status");
    user.agentRequest = "pending";
    return clone(user);
  }

  async decideAgentRequest(adminId: string, userId: string, decision: "approved" | "rejected"): Promise<User> {
    this.assertAdmin(adminId);
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (decision === "approved") {
      user.role = "agent";
      user.agentRequest = "none";
    } else {
      user.agentRequest = "rejected";
    }
    return clone(user);
  }

  async listAgentRequests(): Promise<User[]> {
    return clone(
      [...this.users.values()].filter((u) => u.agentRequest === "pending"),
    );
  }

  async decideMemberTransaction(
    agentId: string,
    txId: string,
    status: "approved" | "rejected",
  ): Promise<Transaction> {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx) throw new Error("Transaction not found");
    await this.assertUpline(agentId, tx.userId);
    return this.setTransactionStatus(txId, status, agentId);
  }

  async listTransactions(userId: string): Promise<Transaction[]> {
    return clone(
      this.transactions
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async recordCash(input: RecordCashInput): Promise<Transaction> {
    const user = this.users.get(input.userId);
    if (!user) throw new Error("User not found");
    if (input.amount <= 0) throw new Error("Amount must be positive");

    const isDebit = input.type === "withdrawal";
    const signed = isDebit ? -input.amount : input.amount;
    // Deposits/withdrawals start pending (need approval); rebates/adjustments post immediately.
    const status: Transaction["status"] =
      input.type === "deposit" || input.type === "withdrawal" ? "pending" : "completed";

    const tx: Transaction = {
      id: this.id("t"),
      userId: input.userId,
      type: input.type,
      amount: signed,
      currency: user.currency,
      status,
      note: input.note,
      createdAt: this.now(),
      processedBy: input.processedBy,
    };
    this.transactions.push(tx);
    if (status === "completed") user.balance += signed;
    return clone(tx);
  }

  async transfer(
    input: CreateTransferInput,
  ): Promise<{ out: Transaction; in: Transaction }> {
    const from = this.users.get(input.fromUserId);
    if (!from) throw new Error("Sender not found");
    const to = await this.getUserByReferralCode(input.toReferralCode);
    if (!to) throw new Error("No user found for that referral code");
    const recipient = this.users.get(to.id)!;
    if (recipient.id === from.id) throw new Error("Cannot transfer to yourself");
    if (input.amount <= 0) throw new Error("Amount must be positive");
    if (from.balance < input.amount) throw new Error("Insufficient balance");

    const ts = this.now();
    const out: Transaction = {
      id: this.id("t"),
      userId: from.id,
      counterpartyId: recipient.id,
      type: "transfer_out",
      amount: -input.amount,
      currency: from.currency,
      status: "completed",
      note: input.note ?? `To ${recipient.username}`,
      createdAt: ts,
      processedBy: from.id,
    };
    const inn: Transaction = {
      id: this.id("t"),
      userId: recipient.id,
      counterpartyId: from.id,
      type: "transfer_in",
      amount: input.amount,
      currency: recipient.currency,
      status: "completed",
      note: input.note ?? `From ${from.username}`,
      createdAt: ts,
      processedBy: from.id,
    };
    from.balance -= input.amount;
    recipient.balance += input.amount;
    this.transactions.push(out, inn);
    return { out: clone(out), in: clone(inn) };
  }

  async setTransactionStatus(
    id: string,
    status: Transaction["status"],
    processedBy: string,
  ): Promise<Transaction> {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    const wasPending = tx.status === "pending";
    tx.status = status;
    tx.processedBy = processedBy;
    // Apply balance impact when a pending cash movement is approved.
    if (wasPending && (status === "approved" || status === "completed")) {
      const user = this.users.get(tx.userId);
      if (user) user.balance += tx.amount;
      if (status === "approved") tx.status = "completed";
    }
    return clone(tx);
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    return clone(
      this.notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async markNotificationRead(id: string): Promise<void> {
    const n = this.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  }

  async getAdminOverview(): Promise<AdminOverview> {
    const users = [...this.users.values()];
    const agents = users.filter((u) => u.role === "agent");
    const players = users.filter((u) => u.role === "player");
    return {
      totalUsers: users.length,
      totalAgents: agents.length,
      totalPlayers: players.length,
      pendingKyc: users.filter((u) => u.kycStatus === "pending").length,
      pendingTransactions: this.transactions.filter((t) => t.status === "pending").length,
      totalBalance: users.reduce((s, u) => s + u.balance, 0),
      platformRake: users.reduce((s, u) => s + u.stats.rakeGenerated, 0),
      currency: "USD",
    };
  }

  async listPendingTransactions(): Promise<Transaction[]> {
    return clone(
      this.transactions
        .filter((t) => t.status === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  private assertAdmin(adminId: string): void {
    if (this.users.get(adminId)?.role !== "admin") {
      throw new Error("Not authorized: admin only");
    }
  }

  async createMember(adminId: string, input: CreateMemberInput): Promise<User> {
    this.assertAdmin(adminId);
    const existing = [...this.users.values()];
    if (existing.some((u) => u.username.toLowerCase() === input.username.trim().toLowerCase())) {
      throw new Error(`Username "${input.username}" already exists`);
    }
    let uplineId: string | null = null;
    if (input.uplineReferralCode) {
      const upline = await this.getUserByReferralCode(input.uplineReferralCode);
      if (!upline) throw new Error(`Unknown upline code "${input.uplineReferralCode}"`);
      uplineId = upline.id;
    }
    // New members are always players; agent status comes via request → approval.
    const member = buildNewMember({ ...input, role: "player" }, this.id("u"), uplineId, String(this.seq));
    this.users.set(member.id, member);
    return clone(member);
  }

  async setKycStatus(adminId: string, userId: string, status: KycStatus): Promise<User> {
    this.assertAdmin(adminId);
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    user.kycStatus = status;
    return clone(user);
  }

  async setAccountStatus(adminId: string, userId: string, status: AccountStatus): Promise<User> {
    this.assertAdmin(adminId);
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role === "admin") throw new Error("Cannot change an admin's account status");
    user.status = status;
    return clone(user);
  }

  async setUserRole(adminId: string, userId: string, role: Role): Promise<User> {
    this.assertAdmin(adminId);
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (user.id === adminId) throw new Error("Cannot change your own role");
    if (role === "admin" && !isAdminEmail(user.email)) {
      throw new Error(`Only ${ADMIN_EMAIL} can be admin`);
    }
    if (isAdminEmail(user.email) && role !== "admin") {
      throw new Error("The platform admin cannot be demoted");
    }
    user.role = role;
    return clone(user);
  }

  async adminAdjustBalance(
    adminId: string,
    userId: string,
    amount: number,
    note?: string,
  ): Promise<Transaction> {
    this.assertAdmin(adminId);
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (amount === 0) throw new Error("Adjustment cannot be zero");
    const tx: Transaction = {
      id: this.id("t"),
      userId,
      type: "adjustment",
      amount, // signed
      currency: user.currency,
      status: "completed",
      note: note ?? "Admin adjustment",
      createdAt: this.now(),
      processedBy: adminId,
    };
    this.transactions.push(tx);
    user.balance += amount;
    return clone(tx);
  }
}
