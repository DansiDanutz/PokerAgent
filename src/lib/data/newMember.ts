import type { User } from "@/types/domain";
import type { CreateMemberInput } from "./repository";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Derive a referral code from a username plus a short random suffix. */
export function deriveReferralCode(username: string, salt: string): string {
  const base = username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "MEMBER";
  return `PA-${base}-${salt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}

/** Validate input and assemble a new member User. Throws on invalid input. */
export function buildNewMember(
  input: CreateMemberInput,
  id: string,
  uplineAgentId: string | null,
  salt: string,
): User {
  const username = input.username.trim();
  const fullName = input.fullName.trim();
  const email = input.email.trim();
  if (username.length < 3) throw new Error(`Invalid username "${input.username}"`);
  if (fullName.length < 2) throw new Error(`Invalid full name for "${username}"`);
  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email for "${username}"`);
  const balance = input.balance ?? 0;
  if (balance < 0) throw new Error(`Balance cannot be negative for "${username}"`);

  return {
    id,
    username,
    fullName,
    email,
    country: undefined,
    role: input.role ?? "player",
    status: "active",
    kycStatus: "unverified",
    uplineAgentId,
    referralCode: deriveReferralCode(username, salt),
    clubggId: input.clubggId?.trim() || undefined,
    clubggNickname: username,
    agentRequest: "none",
    balance,
    currency: "USD",
    createdAt: new Date().toISOString(),
    stats: { handsPlayed: 0, netProfit: 0, rakeGenerated: 0, winRateBb100: 0, sessions: 0, tableHours: 0 },
  };
}
