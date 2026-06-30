/**
 * Deterministic seed data so the app runs and demos out-of-the-box with a
 * realistic agent → player network, balances, transactions and notifications.
 *
 * Money is in minor units (cents). currency USD.
 */

import type { Notification, Transaction, User } from "@/types/domain";

const C = "USD";

function user(
  id: string,
  username: string,
  fullName: string,
  role: User["role"],
  uplineAgentId: string | null,
  referralCode: string,
  balance: number,
  extra: Partial<User> = {},
): User {
  return {
    id,
    username,
    fullName,
    email: `${username}@pokeragent.app`,
    phone: extra.phone,
    country: extra.country ?? "Romania",
    avatarUrl: extra.avatarUrl,
    role,
    status: extra.status ?? "active",
    kycStatus: extra.kycStatus ?? "verified",
    uplineAgentId,
    referralCode,
    clubggId: extra.clubggId,
    clubggNickname: extra.clubggNickname ?? username,
    balance,
    currency: C,
    createdAt: extra.createdAt ?? "2026-01-15T10:00:00.000Z",
    lastActiveAt: extra.lastActiveAt ?? "2026-06-29T19:30:00.000Z",
    stats: extra.stats ?? {
      handsPlayed: 0,
      netProfit: 0,
      rakeGenerated: 0,
      winRateBb100: 0,
      sessions: 0,
      tableHours: 0,
    },
  };
}

export const SEED_USERS: User[] = [
  user("u_admin", "admin", "Platform Admin", "admin", null, "ADMIN-ROOT", 0, {
    kycStatus: "verified",
    stats: { handsPlayed: 0, netProfit: 0, rakeGenerated: 0, winRateBb100: 0, sessions: 0, tableHours: 0 },
  }),

  // --- Top-level agent: Arjun (the agent persona from the mockups) ---
  user("u_arjun", "arjunmehta", "Arjun Mehta", "agent", null, "PAGENT-ARJUN12", 825_000, {
    country: "India", clubggId: "8842001",
    stats: { handsPlayed: 48230, netProfit: 1_240_000, rakeGenerated: 96_000, winRateBb100: 6.4, sessions: 612, tableHours: 120 },
  }),

  // Arjun's direct players
  user("u_alex", "alexplayer", "Alex Player", "player", "u_arjun", "PA-ALEX-77", 125_500, {
    country: "Romania", clubggId: "8842014",
    stats: { handsPlayed: 18420, netProfit: 248_000, rakeGenerated: 21_500, winRateBb100: 4.1, sessions: 233, tableHours: 6 },
  }),
  user("u_sara", "saralin", "Sara Lin", "player", "u_arjun", "PA-SARA-21", 64_200, {
    country: "Singapore", clubggId: "8842027",
    kycStatus: "pending",
    stats: { handsPlayed: 9120, netProfit: -12_400, rakeGenerated: 8_800, winRateBb100: -1.2, sessions: 140, tableHours: 2 },
  }),

  // --- Sub-agent under Arjun: Marco, who has his own downline ---
  user("u_marco", "marcorossi", "Marco Rossi", "agent", "u_arjun", "PA-MARCO-09", 312_000, {
    country: "Italy", clubggId: "8842033",
    stats: { handsPlayed: 22100, netProfit: 410_000, rakeGenerated: 39_000, winRateBb100: 5.0, sessions: 301, tableHours: 80 },
  }),
  user("u_diego", "diegop", "Diego Pérez", "player", "u_marco", "PA-DIEGO-03", 41_800, {
    country: "Spain", clubggId: "8842041",
    stats: { handsPlayed: 7600, netProfit: 53_000, rakeGenerated: 6_900, winRateBb100: 3.3, sessions: 96, tableHours: 5 },
  }),
  user("u_yuki", "yukitanaka", "Yuki Tanaka", "player", "u_marco", "PA-YUKI-88", 9_900, {
    country: "Japan", clubggId: "8842055",
    kycStatus: "unverified",
    status: "active",
    stats: { handsPlayed: 2100, netProfit: -3_200, rakeGenerated: 1_900, winRateBb100: -2.1, sessions: 31, tableHours: 1 },
  }),

  // --- Independent agent (separate network) ---
  user("u_nadia", "nadiak", "Nadia Kovac", "agent", null, "PAGENT-NADIA7", 158_000, {
    country: "Croatia", clubggId: "8842062",
    stats: { handsPlayed: 15300, netProfit: 190_000, rakeGenerated: 17_400, winRateBb100: 3.8, sessions: 188, tableHours: 60 },
  }),
  user("u_tom", "tomh", "Tom Holloway", "player", "u_nadia", "PA-TOM-55", 22_300, {
    country: "UK", clubggId: "8842078",
    stats: { handsPlayed: 5400, netProfit: 12_000, rakeGenerated: 4_200, winRateBb100: 1.4, sessions: 70, tableHours: 1.5 },
  }),

  // --- Alex's own downline (so the player has a tree + member statuses) ---
  user("u_liam", "liamc", "Liam Carter", "player", "u_alex", "PA-LIAM-31", 4_500, {
    country: "Ireland", clubggId: "8842090", kycStatus: "unverified", // → New Player (L0)
    stats: { handsPlayed: 320, netProfit: -1_100, rakeGenerated: 300, winRateBb100: -3.0, sessions: 6, tableHours: 0 },
  }),
  user("u_mia", "miacosta", "Mia Costa", "player", "u_alex", "PA-MIA-44", 18_000, {
    country: "Portugal", clubggId: "8842103", kycStatus: "verified", // → Player (L1, <4h)
    stats: { handsPlayed: 1850, netProfit: 7_400, rakeGenerated: 2_100, winRateBb100: 2.2, sessions: 24, tableHours: 1 },
  }),
  user("u_noah", "noahw", "Noah Williams", "player", "u_alex", "PA-NOAH-07", 52_000, {
    country: "Canada", clubggId: "8842117", kycStatus: "verified", // → VIP Player (L2, 12h)
    stats: { handsPlayed: 6400, netProfit: 88_000, rakeGenerated: 9_300, winRateBb100: 4.6, sessions: 88, tableHours: 12 },
  }),
];

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: "t1", userId: "u_alex", type: "deposit", amount: 50_000, currency: C, status: "completed", note: "Card deposit", createdAt: "2026-06-20T12:00:00.000Z", processedBy: "u_arjun" },
  { id: "t2", userId: "u_alex", type: "rake_rebate", amount: 3_200, currency: C, status: "completed", note: "Weekly rakeback", createdAt: "2026-06-23T09:00:00.000Z", processedBy: "u_arjun" },
  { id: "t3", userId: "u_alex", type: "withdrawal", amount: -20_000, currency: C, status: "pending", note: "Withdrawal to wallet", createdAt: "2026-06-28T18:30:00.000Z" },
  { id: "t4", userId: "u_alex", type: "transfer_out", counterpartyId: "u_sara", amount: -5_000, currency: C, status: "completed", note: "To Sara", createdAt: "2026-06-26T15:10:00.000Z", processedBy: "u_alex" },
  { id: "t5", userId: "u_sara", type: "transfer_in", counterpartyId: "u_alex", amount: 5_000, currency: C, status: "completed", note: "From Alex", createdAt: "2026-06-26T15:10:00.000Z", processedBy: "u_alex" },
  { id: "t6", userId: "u_sara", type: "deposit", amount: 60_000, currency: C, status: "pending", note: "Bank transfer", createdAt: "2026-06-29T08:00:00.000Z" },
  { id: "t7", userId: "u_diego", type: "deposit", amount: 40_000, currency: C, status: "completed", createdAt: "2026-06-18T11:00:00.000Z", processedBy: "u_marco" },
  { id: "t8", userId: "u_arjun", type: "rake_rebate", amount: 18_400, currency: C, status: "completed", note: "Agent commission June W3", createdAt: "2026-06-22T10:00:00.000Z", processedBy: "u_admin" },
];

export const SEED_NOTIFICATIONS: Notification[] = [
  { id: "n1", userId: "u_alex", kind: "referral", title: "New Referral", body: "Sara Lin joined using your invite code.", read: false, createdAt: "2026-06-26T15:00:00.000Z" },
  { id: "n2", userId: "u_alex", kind: "money", title: "Rakeback received", body: "$32.00 weekly rakeback credited.", read: false, createdAt: "2026-06-23T09:01:00.000Z" },
  { id: "n3", userId: "u_alex", kind: "promotion", title: "Weekend Freeroll", body: "Join the $1,000 network freeroll Saturday 8pm.", read: true, createdAt: "2026-06-21T12:00:00.000Z" },
  { id: "n4", userId: "u_alex", kind: "security", title: "New device sign-in", body: "A new device signed in from Bucharest.", read: true, createdAt: "2026-06-19T20:00:00.000Z" },
  { id: "n5", userId: "u_arjun", kind: "money", title: "Commission paid", body: "$184.00 agent commission credited for June W3.", read: false, createdAt: "2026-06-22T10:01:00.000Z" },
  { id: "n6", userId: "u_arjun", kind: "referral", title: "Downline growth", body: "Marco Rossi added 2 new players this week.", read: false, createdAt: "2026-06-25T16:00:00.000Z" },
];

/** Demo logins surfaced on the login screen so reviewers can try each role. */
export const DEMO_LOGINS = [
  { label: "Player", userId: "u_alex", hint: "alexplayer" },
  { label: "Agent", userId: "u_arjun", hint: "arjunmehta" },
  { label: "Admin", userId: "u_admin", hint: "admin" },
] as const;
