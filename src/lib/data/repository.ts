/**
 * Repository interface — the single contract every data source (in-memory
 * seed, Supabase, …) implements. UI and server code depend only on this, so
 * the storage backend can be swapped without touching feature code.
 */

import type {
  AdminOverview,
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

export interface Repository {
  // --- users ---
  getUser(id: string): Promise<User | null>;
  getUserByReferralCode(code: string): Promise<User | null>;
  listUsers(filter?: { role?: Role; q?: string }): Promise<User[]>;

  // --- network (agent tree) ---
  getNetworkTree(agentId: string): Promise<NetworkNode | null>;
  getNetworkSummary(agentId: string): Promise<NetworkSummary>;

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

  // --- admin ---
  getAdminOverview(): Promise<AdminOverview>;
  listPendingTransactions(): Promise<Transaction[]>;
}
