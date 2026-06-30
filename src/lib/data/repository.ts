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

export interface CreateTransferInput {
  fromUserId: string;
  toReferralCode: string;
  amount: number; // minor units, positive
  note?: string;
}

export interface RecordCashInput {
  userId: string;
  type: Extract<TransactionType, "deposit" | "withdrawal" | "adjustment" | "rake_rebate">;
  amount: number; // minor units, positive magnitude
  note?: string;
  processedBy?: string;
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

export interface CreditMemberInput {
  /** The agent performing the credit (must be the member's upline). */
  agentId: string;
  memberId: string;
  type: Extract<TransactionType, "deposit" | "rake_rebate" | "adjustment">;
  amount: number; // minor units, positive magnitude
  note?: string;
}

export interface Repository {
  // --- users ---
  getUser(id: string): Promise<User | null>;
  getUserByReferralCode(code: string): Promise<User | null>;
  listUsers(filter?: { role?: Role; q?: string }): Promise<User[]>;

  // --- network (agent tree) ---
  getNetworkTree(agentId: string): Promise<NetworkNode | null>;
  getNetworkSummary(agentId: string): Promise<NetworkSummary>;
  /** Flattened list of every user in an agent's downline subtree. */
  listDownline(agentId: string): Promise<User[]>;
  /** True when `agentId` is an ancestor (upline) of `userId`. */
  isUpline(agentId: string, userId: string): Promise<boolean>;

  // --- agent member management (authorized: agent must be the member's upline) ---
  creditMember(input: CreditMemberInput): Promise<Transaction>;
  setMemberTableHours(agentId: string, memberId: string, hours: number): Promise<User>;
  promoteToAgent(agentId: string, memberId: string): Promise<User>;
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

  // --- notifications ---
  listNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;

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
