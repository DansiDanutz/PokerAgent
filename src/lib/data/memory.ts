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
  RakebackTierChange,
  RecordCashInput,
  Repository,
  SweepResult,
} from "./repository";
import type { ClubggMemberStats } from "@/lib/clubgg/statsImport";
import { planDistribution, type StatsImportPlan, type DistributionMember } from "@/lib/clubgg/distribution";
import { randomBytes } from "node:crypto";
import { buildNewMember } from "./newMember";
import { hashPassword } from "@/lib/auth/password";
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
import { SEED_NOTIFICATIONS, SEED_PASSWORD_HASH, SEED_TRANSACTIONS, SEED_USERS } from "./seed";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** `LevelInputs` shape for a network node — VIP/rakeback status is driven by the member themselves, not the viewer. */
function levelInputsFor(n: NetworkNode): { kycVerified: boolean; tableHours: number; directReferrals: number } {
  return {
    kycVerified: n.user.kycStatus === "verified",
    tableHours: n.user.stats.tableHours,
    directReferrals: n.children.length,
  };
}

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
    // Every non-admin seeded account shares the public demo password (see
    // seed.ts). The admin account never gets a known/shared credential, even
    // in this zero-config demo driver — it gets a fresh random password every
    // boot, printed once to the server console (never returned to a client).
    this.passwords = new Map(
      SEED_USERS.filter((u) => !isAdminEmail(u.email)).map((u) => [u.id, SEED_PASSWORD_HASH]),
    );
    const adminId = SEED_USERS.find((u) => isAdminEmail(u.email))?.id;
    if (adminId) {
      const adminPassword = randomBytes(9).toString("base64url");
      this.passwords.set(adminId, hashPassword(adminPassword));
      // eslint-disable-next-line no-console -- intentional one-time operator credential
      console.log(
        `[data] In-memory driver: generated admin password for ${ADMIN_EMAIL}: ${adminPassword} ` +
          `(changes every restart; set DATA_DRIVER=supabase for a real deployment)`,
      );
    }
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

  async findUserByEmail(email: string): Promise<User | null> {
    const norm = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === norm) return clone(u);
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
    // Whole subtree — informational totals only ("how big is your empire").
    const flat = node ? flattenNetwork(node) : [];
    // "Own business" — stops descending past a nested agent, since a
    // sub-agent's downline is that sub-agent's tier, not their upline's.
    // This is the scope that drives every money calculation below.
    const own = node ? flattenOwnBusiness(node) : [];

    // L0 (not yet KYC-verified) players can play, but their rake doesn't
    // count toward the agent's commission until they reach L1 — this is the
    // lever an agent has to chase: get players verified to start earning.
    const rakebackEligibleOwn = own.filter((n) => isRakebackEligible(levelInputsFor(n)));
    const networkRake = rakebackEligibleOwn.reduce((s, n) => s + n.user.stats.rakeGenerated, 0);
    const vipNetworkCount = own.filter((n) => memberStatus(levelInputsFor(n)) === "vip_player").length;

    // A negative agent is frozen: they stop earning (displayed) commission until
    // they settle their balance back to zero or above.
    const frozen = (agent?.balance ?? 0) < 0;
    // Anyone can refer friends, but earning commission from your own network
    // requires YOU to be VIP (L2+) — a brand-new player can grow a tree, they
    // just don't get paid from it until they reach VIP themselves.
    const selfEarns =
      !!agent &&
      canEarnReferrals({
        kycVerified: agent.kycStatus === "verified",
        tableHours: agent.stats.tableHours,
        directReferrals: node?.children.length ?? 0,
      });

    let commissionRate = 0;
    if (agent && selfEarns && !frozen) {
      // Agents: a locked monthly rate (see recalculateMonthlyRakebackTiers)
      // takes over once set; undefined only for pre-feature agents who
      // haven't hit a monthly run yet, which falls back to a live estimate.
      commissionRate =
        agent.role === "agent"
          ? (agent.currentRakebackRate ?? rakebackRateForTier(AGENT_RAKEBACK_TIERS, vipNetworkCount))
          : rakebackRateForTier(REFERRAL_RAKEBACK_TIERS, vipNetworkCount);
    }

    return {
      directReferrals: node ? node.children.length : 0,
      totalNetwork: flat.length,
      activePlayers: flat.filter((n) => n.user.stats.handsPlayed > 0).length,
      networkRake,
      commissionEarned: Math.round(networkRake * commissionRate),
      commissionRate,
      vipNetworkCount,
      frozen,
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

  async changeUpline(userId: string, newReferralCode: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    if (!user.uplineAgentId) throw new Error("You don't have an agent to change");
    if (!isDormant(user.lastActiveAt, new Date(), user.createdAt)) {
      throw new Error("You can only change agents after 1 year of inactivity");
    }
    const newAgent = this.users.get(
      (await this.getUserByReferralCode(newReferralCode))?.id ?? "",
    );
    if (!newAgent) throw new Error("No user found for that referral code");
    if (newAgent.id === user.id) throw new Error("You cannot refer yourself");
    if (newAgent.id === user.uplineAgentId) throw new Error("You are already with that agent");
    if (await this.isUpline(user.id, newAgent.id)) {
      throw new Error("That would create a loop in your network");
    }

    const oldAgent = this.users.get(user.uplineAgentId);
    user.uplineAgentId = newAgent.id;
    // Switching agents is itself activity — reset the dormancy clock.
    user.lastActiveAt = this.now();

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

    return clone(user);
  }

  private isMemberRakebackEligible(member: User): boolean {
    return isRakebackEligible({
      kycVerified: member.kycStatus === "verified",
      tableHours: member.stats.tableHours,
      directReferrals: this.childrenOf(member.id).length,
    });
  }

  private async assertUpline(agentId: string, memberId: string): Promise<void> {
    // Admins may manage anyone; agents only their own downline.
    if (this.users.get(agentId)?.role === "admin") return;
    if (!(await this.isUpline(agentId, memberId))) {
      throw new Error("Not authorized: that member is not in your network");
    }
  }

  /**
   * Total credit limits an agent has extended to their DIRECT players — the
   * cash they've promised to have on hand to cover if those players go
   * negative. This is a live commitment, not a one-time check: every action
   * that would leave the agent's balance below this total is blocked (see
   * `assertRetainsExposureCapacity`), so "credit limit" stays a real,
   * balance-backed reserve instead of a paper ceiling that can be spent away.
   */
  private creditExposure(agentId: string, excludePlayerId?: string): number {
    return [...this.users.values()]
      .filter((u) => u.uplineAgentId === agentId && u.id !== excludePlayerId)
      .reduce((s, u) => s + (u.creditLimit ?? 0), 0);
  }

  /**
   * Guard for any voluntary balance-reducing action an agent takes (transfer
   * out, crediting a player): the balance left behind must still cover every
   * credit limit the agent has extended. Admin is exempt — the admin is the
   * system's root source of value, not a capital-constrained party.
   */
  private assertRetainsExposureCapacity(agent: User, amountLeaving: number): void {
    if (agent.role === "admin") return;
    const exposure = this.creditExposure(agent.id);
    const remaining = agent.balance - amountLeaving;
    if (remaining < exposure) {
      throw new Error(
        `That would leave you with ${formatMoney(remaining, agent.currency)}, below the ` +
          `${formatMoney(exposure, agent.currency)} you've committed in player credit limits. ` +
          `Lower a player's limit first, or keep more in reserve.`,
      );
    }
  }

  async creditMember(input: CreditMemberInput): Promise<Transaction> {
    await this.assertUpline(input.agentId, input.memberId);
    const agent = this.users.get(input.agentId);
    if (!agent) throw new Error("Agent not found");
    const member = this.users.get(input.memberId);
    if (!member) throw new Error("Member not found");
    if (input.amount <= 0) throw new Error("Amount must be positive");
    if (input.type === "rake_rebate" && !this.isMemberRakebackEligible(member)) {
      throw new Error("This player must verify KYC (Level 1) before they can receive rakeback");
    }

    const ts = this.now();
    // Agents fund credits from their OWN balance — every chip is backed.
    // Admin is exempt (admin is the system's root source of value).
    if (agent.role !== "admin") {
      if (agent.balance < input.amount) {
        throw new Error("Insufficient balance — request credit from admin first");
      }
      this.assertRetainsExposureCapacity(agent, input.amount);
      const debit: Transaction = {
        id: this.id("t"),
        userId: agent.id,
        counterpartyId: member.id,
        type: "transfer_out",
        amount: -input.amount,
        currency: agent.currency,
        status: "completed",
        note: input.note ?? `Credit to ${member.username}`,
        createdAt: ts,
        processedBy: agent.id,
      };
      agent.balance -= input.amount;
      this.transactions.push(debit);
    }
    const credit: Transaction = {
      id: this.id("t"),
      userId: member.id,
      counterpartyId: agent.role !== "admin" ? agent.id : undefined,
      type: input.type, // semantic label for the member's history
      amount: input.amount,
      currency: member.currency,
      status: "completed",
      note: input.note,
      createdAt: ts,
      processedBy: agent.id,
    };
    member.balance += input.amount;
    this.transactions.push(credit);
    return clone(credit);
  }

  async setPlayerCreditLimit(actorId: string, playerId: string, creditLimit: number): Promise<User> {
    const actor = this.users.get(actorId);
    if (!actor) throw new Error("User not found");
    const player = this.users.get(playerId);
    if (!player) throw new Error("Player not found");
    if (creditLimit < 0) throw new Error("Credit limit cannot be negative");
    // The DB enforces `balance >= -credit_limit` on the Supabase driver;
    // check it here too so lowering a limit below what the player currently
    // owes fails with a clear message instead of corrupting the invariant.
    if (player.balance < -creditLimit) {
      throw new Error(`${player.fullName} currently owes ${formatMoney(-player.balance, player.currency)} — you can't set the limit below that`);
    }
    const isAdmin = actor.role === "admin";
    if (!isAdmin) {
      // Agents may only set limits on their DIRECT players.
      if (player.uplineAgentId !== actorId) {
        throw new Error("You can only set credit limits for your own players");
      }
      // Sum of limits across the agent's players cannot exceed the agent's balance.
      const others = this.creditExposure(actorId, playerId);
      if (others + creditLimit > actor.balance) {
        throw new Error("Total credit limits would exceed your balance");
      }
    }
    player.creditLimit = creditLimit;
    return clone(player);
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
    // Mirrors the dashboard's "Path to Agent" gate (agentProgress) — without
    // this, any player could bypass the UI and request agent status with 0
    // qualifying VIP referrals.
    const { vipNetworkCount } = await this.getNetworkSummary(userId);
    if (!agentProgress({ vipNetworkCount }).eligible) {
      throw new Error(`You need at least ${AGENT_MIN_VIP_NETWORK} VIP players in your network to request agent status`);
    }
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
      // Provisional rate from the live VIP count so a brand-new agent isn't
      // stuck at 0% until the next monthly recalculation locks in the real,
      // qualified rate.
      const vipCount = flattenOwnBusiness(this.buildNode(user)).filter(
        (n) => memberStatus(levelInputsFor(n)) === "vip_player",
      ).length;
      user.currentRakebackRate = rakebackRateForTier(AGENT_RAKEBACK_TIERS, vipCount);
      user.rakebackTierAsOf = this.now();
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

    // Self-deposits start pending (admin approves); rebates/adjustments post now.
    const status: Transaction["status"] = input.type === "deposit" ? "pending" : "completed";
    const tx: Transaction = {
      id: this.id("t"),
      userId: input.userId,
      type: input.type,
      amount: input.amount, // always a positive credit now (no withdrawals here)
      currency: user.currency,
      status,
      note: input.note,
      createdAt: this.now(),
      processedBy: input.processedBy,
    };
    this.transactions.push(tx);
    if (status === "completed") user.balance += input.amount;
    return clone(tx);
  }

  /** Gate for non-admin money movement between two existing users. */
  private assertTransferAllowed(from: User, to: User): void {
    if (from.role === "admin") {
      throw new Error("Admins use Adjust balance, not transfer");
    }
    if (from.role === "agent" && to.role === "player") {
      // Agent may only fund players in their own downline (direct or indirect).
      let cur = to.uplineAgentId;
      let guard = 0;
      let inNetwork = false;
      while (cur && guard < 50) {
        if (cur === from.id) { inNetwork = true; break; }
        cur = this.users.get(cur)?.uplineAgentId ?? null;
        guard += 1;
      }
      if (!inNetwork) throw new Error("You can only send chips to players in your own network");
      return;
    }
    if (from.role === "agent" && to.role === "agent") return; // agent ↔ agent allowed
    if (from.role === "player" && to.role === "agent") return; // pay back any agent
    if (from.role === "player" && to.role === "player") {
      if (!from.uplineAgentId || from.uplineAgentId !== to.uplineAgentId) {
        throw new Error("Players can only transfer to other players under the same agent");
      }
      return;
    }
    throw new Error("That transfer is not allowed");
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
    this.assertTransferAllowed(from, recipient);
    if (input.amount <= 0) throw new Error("Amount must be positive");
    if (from.balance < input.amount) throw new Error("Insufficient balance");
    this.assertRetainsExposureCapacity(from, input.amount);

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
    // Guard the status transition itself, matching pa_approve_transaction's
    // `WHERE status = 'pending'` on the Supabase driver — without this, a
    // second decision on an already-decided transaction silently overwrites
    // its status (e.g. flipping a completed/credited deposit to "rejected")
    // while the balance impact from the first decision stands uncorrected.
    if (tx.status !== "pending") throw new Error("Request already decided");
    tx.status = status === "approved" ? "completed" : status;
    tx.processedBy = processedBy;
    if (status === "approved" || status === "completed") {
      const user = this.users.get(tx.userId);
      if (user) user.balance += tx.amount;
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

  async markNotificationRead(id: string, userId: string): Promise<void> {
    const n = this.notifications.find((x) => x.id === id);
    if (n && n.userId === userId) n.read = true;
  }

  async addNotification(input: Omit<Notification, "id" | "read" | "createdAt">): Promise<Notification> {
    const n: Notification = { ...input, id: this.id("n"), read: false, createdAt: this.now() };
    this.notifications.push(n);
    return clone(n);
  }

  // --- agent credit / settlement -------------------------------------------
  async requestAgentCredit(agentId: string, amount: number, note?: string): Promise<Transaction> {
    const agent = this.users.get(agentId);
    if (!agent) throw new Error("User not found");
    if (agent.role !== "agent") throw new Error("Only agents can request credit");
    if (amount <= 0) throw new Error("Amount must be positive");
    if (agent.balance < 0) {
      throw new Error("Your balance is negative — settle it before requesting credit");
    }
    const tx: Transaction = {
      id: this.id("t"),
      userId: agentId,
      type: "agent_credit",
      amount, // positive magnitude, not yet applied
      currency: agent.currency,
      status: "pending",
      note,
      createdAt: this.now(),
    };
    this.transactions.push(tx);
    return clone(tx);
  }

  async decideAgentCredit(
    adminId: string,
    txId: string,
    decision: "approved" | "rejected",
  ): Promise<Transaction> {
    this.assertAdmin(adminId);
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx) throw new Error("Transaction not found");
    if (tx.type !== "agent_credit") throw new Error("Not a credit request");
    if (tx.status !== "pending") throw new Error("Request already decided");
    return this.setTransactionStatus(txId, decision, adminId);
  }

  async listAgentCreditRequests(): Promise<Transaction[]> {
    return clone(
      this.transactions
        .filter((t) => t.type === "agent_credit" && t.status === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async listSettlements(): Promise<Transaction[]> {
    return clone(
      this.transactions
        .filter((t) => t.type === "agent_credit")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  // --- daily negative-balance sweep ----------------------------------------
  async sweepNegativeBalances(): Promise<SweepResult[]> {
    const results: SweepResult[] = [];
    const ts = this.now();
    for (const player of [...this.users.values()]) {
      if (player.role !== "player" || player.balance >= 0 || !player.uplineAgentId) continue;
      const agent = this.users.get(player.uplineAgentId);
      if (!agent) continue;
      const amount = -player.balance; // positive shortfall

      // Zero the player, debit the agent — paired adjustment entries.
      this.transactions.push({
        id: this.id("t"), userId: player.id, counterpartyId: agent.id, type: "adjustment",
        amount, currency: player.currency, status: "completed",
        note: "Negative balance settled by agent", createdAt: ts, processedBy: agent.id,
      });
      player.balance = 0;
      this.transactions.push({
        id: this.id("t"), userId: agent.id, counterpartyId: player.id, type: "adjustment",
        amount: -amount, currency: agent.currency, status: "completed",
        note: `Absorbed ${player.username}'s negative balance`, createdAt: ts, processedBy: agent.id,
      });
      agent.balance -= amount;

      results.push({ playerId: player.id, agentId: agent.id, amount, agentNowNegative: agent.balance < 0 });
    }
    return results;
  }

  // --- ClubGG stats import -------------------------------------------------
  private levelInputsForUser(u: User) {
    return {
      kycVerified: u.kycStatus === "verified",
      tableHours: u.stats.tableHours,
      directReferrals: this.childrenOf(u.id).length,
    };
  }

  /** AGENT ancestors nearest→top (agents only; stops at the admin root). */
  private agentChainOf(userId: string): string[] {
    const chain: string[] = [];
    let cur = this.users.get(userId)?.uplineAgentId ?? null;
    let guard = 0;
    while (cur && guard++ < 100) {
      const u = this.users.get(cur);
      if (!u || u.role === "admin") break; // reached the platform root
      if (u.role === "agent") chain.push(u.id);
      cur = u.uplineAgentId ?? null;
    }
    return chain;
  }

  /** Who owns a user's cash flow: an agent owns his own; a player's is owned
   *  by his nearest agent; null when only admin sits above (house absorbs). */
  private cashflowOwnerOf(userId: string): string | null {
    const u = this.users.get(userId);
    if (!u) return null;
    if (u.role === "agent") return u.id;
    return this.agentChainOf(userId)[0] ?? null;
  }

  /** Compute the full distribution plan from CURRENT state, mutating nothing. */
  /** Per-agent effective rate + name + club-wide rakeback eligibility, shared
   *  by the import and the estimate so both run identical economics. */
  private async ratesContext(): Promise<{
    eligibleIds: Set<string>;
    rateByAgent: Map<string, number>;
    nameByAgent: Map<string, string>;
  }> {
    const eligibleIds = new Set<string>();
    const rateByAgent = new Map<string, number>();
    const nameByAgent = new Map<string, string>();
    for (const u of this.users.values()) {
      if (isRakebackEligible(this.levelInputsForUser(u))) eligibleIds.add(u.id);
      if (u.role === "agent") {
        nameByAgent.set(u.id, u.username);
        rateByAgent.set(u.id, (await this.getNetworkSummary(u.id)).commissionRate);
      }
    }
    return { eligibleIds, rateByAgent, nameByAgent };
  }

  private async buildStatsImportPlan(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    this.assertAdmin(adminId);
    const { eligibleIds, rateByAgent, nameByAgent } = await this.ratesContext();
    const membersByClubId = new Map<string, DistributionMember>();
    for (const u of this.users.values()) {
      if (u.clubggId) membersByClubId.set(u.clubggId, { id: u.id, username: u.username });
    }
    return planDistribution(rows, {
      playerRakebackRate: CLUB.playerRakebackRate,
      membersByClubId,
      rakebackEligible: (id) => eligibleIds.has(id),
      agentChainOf: (id) => this.agentChainOf(id),
      agentRate: (id) => rateByAgent.get(id) ?? 0,
      agentUsername: (id) => nameByAgent.get(id) ?? id,
      cashflowOwnerOf: (id) => this.cashflowOwnerOf(id),
    });
  }

  async previewStatsImport(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    return clone(await this.buildStatsImportPlan(adminId, rows));
  }

  async estimateDistribution(agentId: string): Promise<StatsImportPlan> {
    const agent = this.users.get(agentId);
    if (!agent) throw new Error("User not found");
    const { eligibleIds, rateByAgent, nameByAgent } = await this.ratesContext();
    // Downline members become rows keyed by id, carrying their LIFETIME rake.
    const downline = [...this.users.values()].filter((u) => this.isDescendantOf(u.id, agentId));
    const membersByClubId = new Map<string, DistributionMember>(
      downline.map((m) => [m.id, { id: m.id, username: m.username }]),
    );
    const rows: ClubggMemberStats[] = downline.map((m) => ({
      clubggId: m.id,
      nickname: m.username,
      handsPlayed: m.stats.handsPlayed,
      rake: m.stats.rakeGenerated,
      buyIn: 0,
      cashOut: 0,
      profitLoss: m.stats.netProfit,
      hours: m.stats.tableHours,
    }));
    // Cap the override chain at the viewing agent — their subtree view.
    const cappedChain = (userId: string): string[] => {
      const full = this.agentChainOf(userId);
      const idx = full.indexOf(agentId);
      return idx === -1 ? full : full.slice(0, idx + 1);
    };
    return clone(
      planDistribution(rows, {
        playerRakebackRate: CLUB.playerRakebackRate,
        membersByClubId,
        rakebackEligible: (id) => eligibleIds.has(id),
        agentChainOf: cappedChain,
        agentRate: (id) => rateByAgent.get(id) ?? 0,
        agentUsername: (id) => nameByAgent.get(id) ?? id,
        cashflowOwnerOf: (id) => this.cashflowOwnerOf(id),
      }),
    );
  }

  /** True when `userId` is somewhere in `agentId`'s downline subtree. */
  private isDescendantOf(userId: string, agentId: string): boolean {
    let cur = this.users.get(userId)?.uplineAgentId ?? null;
    let guard = 0;
    while (cur && guard++ < 100) {
      if (cur === agentId) return true;
      cur = this.users.get(cur)?.uplineAgentId ?? null;
    }
    return false;
  }

  async applyStatsImport(adminId: string, rows: ClubggMemberStats[]): Promise<StatsImportPlan> {
    // Plan from PRE-import state so rates/eligibility are deterministic and
    // preview == apply. Then commit stat deltas, rakeback and settlements.
    const plan = await this.buildStatsImportPlan(adminId, rows);
    const ts = this.now();

    for (const line of plan.lines) {
      if (!line.matched || !line.userId) continue;
      const member = this.users.get(line.userId);
      if (!member) continue;
      member.stats = {
        ...member.stats,
        handsPlayed: member.stats.handsPlayed + line.handsPlayed,
        tableHours: member.stats.tableHours + line.tableHours,
        rakeGenerated: member.stats.rakeGenerated + line.rake,
        netProfit: member.stats.netProfit + line.netProfit,
        sessions: member.stats.sessions + (line.handsPlayed > 0 ? 1 : 0),
      };
      if (line.playerRakeback > 0) {
        member.balance += line.playerRakeback;
        this.transactions.push({
          id: this.id("t"), userId: member.id, type: "rake_rebate",
          amount: line.playerRakeback, currency: member.currency, status: "completed",
          note: "ClubGG rakeback", createdAt: ts, processedBy: adminId,
        });
      }
    }

    for (const s of plan.settlements) {
      const agent = this.users.get(s.agentId);
      if (!agent) continue;
      agent.balance += s.commission;
      this.transactions.push({
        id: this.id("t"), userId: agent.id, type: "agent_credit",
        amount: s.commission, currency: agent.currency, status: "completed",
        note: "ClubGG rake settlement", createdAt: ts, processedBy: adminId,
      });
      await this.addNotification({
        userId: agent.id, kind: "money", title: "Rake settlement paid",
        body: `You earned ${formatMoney(s.commission, agent.currency)} override commission from your network's rake.`,
      });
    }

    // Game-money settlement: chips that moved BETWEEN networks at the tables
    // become real admin↔agent money. Winning networks get paid (so the agent
    // can pay his winners); losing networks get collected from (the agent
    // collects from his losers — his cash flow to manage). A collection that
    // the agent's balance + admin credit line can't absorb is recorded as a
    // PENDING debit (a tracked receivable) instead of silently failing —
    // admin approves it from the queue once the agent deposits.
    for (const g of plan.gameSettlements) {
      const agent = this.users.get(g.agentId);
      if (!agent) continue;
      if (g.networkPnl > 0) {
        agent.balance += g.networkPnl;
        this.transactions.push({
          id: this.id("t"), userId: agent.id, type: "adjustment",
          amount: g.networkPnl, currency: agent.currency, status: "completed",
          note: "Game settlement · network winnings payout", createdAt: ts, processedBy: adminId,
        });
        await this.addNotification({
          userId: agent.id, kind: "money", title: "Game settlement received",
          body: `${formatMoney(g.networkPnl, agent.currency)} credited — your network won this period. Pay out your winning players.`,
        });
      } else {
        const debit = -g.networkPnl;
        const floor = -(agent.creditLimit ?? 0);
        if (agent.balance - debit >= floor) {
          agent.balance -= debit;
          this.transactions.push({
            id: this.id("t"), userId: agent.id, type: "adjustment",
            amount: -debit, currency: agent.currency, status: "completed",
            note: "Game settlement · network losses collection", createdAt: ts, processedBy: adminId,
          });
          await this.addNotification({
            userId: agent.id, kind: "money", title: "Game settlement collected",
            body: `${formatMoney(debit, agent.currency)} collected — your network lost this period. Collect from your losing players.`,
          });
        } else {
          this.transactions.push({
            id: this.id("t"), userId: agent.id, type: "adjustment",
            amount: -debit, currency: agent.currency, status: "pending",
            note: "Game settlement · network losses — awaiting agent deposit", createdAt: ts, processedBy: adminId,
          });
          await this.addNotification({
            userId: agent.id, kind: "money", title: "Deposit required — game settlement",
            body: `Your network lost ${formatMoney(debit, agent.currency)} this period, more than your balance and credit line cover. Deposit funds so the admin can settle it.`,
          });
          plan.warnings.push(
            `@${g.username} owes ${formatMoney(debit, agent.currency)} but balance + credit line can't cover it — recorded as a PENDING collection in the approvals queue.`,
          );
        }
      }
    }

    return clone(plan);
  }

  // --- monthly rakeback tier recalculation ----------------------------------
  async recalculateMonthlyRakebackTiers(): Promise<RakebackTierChange[]> {
    const ts = this.now();
    // Idempotency guard: a retried/duplicate cron delivery on the same day
    // must not re-run this — it would reset the hours baseline twice and
    // silently zero out agents' qualifying VIP counts. Day precision (not
    // month) is deliberate: decideAgentRequest also stamps rakebackTierAsOf
    // when granting a brand-new agent's provisional rate, so a month-wide
    // check would treat "someone was approved this month" as "the monthly
    // cron already ran this month" and silently suppress the real run for
    // every other agent — day precision only blocks a same-day retry.
    const todayKey = ts.slice(0, 10);
    const agents = [...this.users.values()].filter((u) => u.role === "agent");
    if (agents.some((a) => a.rakebackTierAsOf?.slice(0, 10) === todayKey)) {
      return [];
    }
    const qualifies = (n: NetworkNode): boolean => {
      const played = n.user.stats.tableHours - (n.user.stats.lastMonthlySnapshotHours ?? 0);
      if (played < AGENT_MIN_MONTHLY_HOURS) return false;
      return memberStatus(levelInputsFor(n)) === "vip_player";
    };

    const results: RakebackTierChange[] = [];
    for (const agent of agents) {
      const qualifiedVipCount = flattenOwnBusiness(this.buildNode(agent)).filter(qualifies).length;
      const newRate = rakebackRateForTier(AGENT_RAKEBACK_TIERS, qualifiedVipCount);
      results.push({
        agentId: agent.id,
        previousRate: agent.currentRakebackRate ?? 0,
        newRate,
        qualifiedVipCount,
      });
      agent.currentRakebackRate = newRate;
      agent.rakebackTierAsOf = ts;
    }

    // Reset the hours baseline for EVERY user (not just agents' downlines)
    // so next month's delta is correct platform-wide.
    for (const u of this.users.values()) {
      u.stats = { ...u.stats, lastMonthlySnapshotHours: u.stats.tableHours };
    }
    return results;
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
        // agent_credit requests live in their own Settlement queue, not here.
        .filter((t) => t.status === "pending" && t.type !== "agent_credit")
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
