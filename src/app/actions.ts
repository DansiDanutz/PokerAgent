"use server";

/**
 * Server actions — the write surface for the UI. All mutations funnel through
 * the repository and re-validate affected paths.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { clearSession, getCurrentUser, setSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function login(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const cred = await getRepository().findAuthByEmail(parsed.data.email);
  // Same error whether the email is unknown or the password is wrong.
  if (!cred || !verifyPassword(parsed.data.password, cred.passwordHash)) {
    throw new Error("Invalid email or password");
  }
  await setSession(cred.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export type FormState = { error?: string };

/** useActionState wrapper for the login form — returns inline errors. */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await login(formData);
    return {};
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Login failed" };
  }
}

/** useActionState wrapper for the register form. */
export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await register(formData);
    return {};
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Registration failed" };
  }
}

/** useActionState wrapper for transfers (used on the wallet screen). */
export async function transferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await transfer(formData);
    return { error: undefined };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Transfer failed" };
  }
}

/** Next throws a special error to perform redirects; let it propagate. */
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  referralCode: z.string().optional(),
});

export async function register(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  // Self-service signups are always players; agent status is requested later.
  const user = await getRepository().createAccount({
    username: parsed.data.username,
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    uplineReferralCode: parsed.data.referralCode,
  });
  await setSession(user.id);
  redirect("/dashboard");
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not signed in");
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const repo = getRepository();
    const cred = await repo.findAuthByEmail(user.email);
    if (!cred || !verifyPassword(parsed.data.currentPassword, cred.passwordHash)) {
      return { error: "Current password is incorrect" };
    }
    await repo.setPasswordHash(user.id, hashPassword(parsed.data.newPassword));
    return { error: undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change password" };
  }
}

const transferSchema = z.object({
  toReferralCode: z.string().min(1, "Enter the recipient's code"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  note: z.string().optional(),
});

export async function transfer(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  const parsed = transferSchema.safeParse({
    toReferralCode: formData.get("toReferralCode"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().transfer({
    fromUserId: user.id,
    toReferralCode: parsed.data.toReferralCode,
    amount: Math.round(parsed.data.amount * 100),
    note: parsed.data.note,
  });
  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

const cashSchema = z.object({
  type: z.enum(["deposit", "withdrawal"]),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
});

export async function recordCash(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  const parsed = cashSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().recordCash({
    userId: user.id,
    type: parsed.data.type,
    amount: Math.round(parsed.data.amount * 100),
    note: parsed.data.type === "deposit" ? "Deposit request" : "Withdrawal request",
  });
  revalidatePath("/wallet");
}

export async function approveTransaction(id: string, decision: "approved" | "rejected"): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") throw new Error("Admin only");
  await getRepository().setTransactionStatus(id, decision, admin.id);
  revalidatePath("/admin");
}

export async function readNotification(id: string): Promise<void> {
  await getRepository().markNotificationRead(id);
  revalidatePath("/notifications");
}

// --- Agent member management -----------------------------------------------

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "agent" && user.role !== "admin")) {
    throw new Error("Agents only");
  }
  return user;
}

const creditSchema = z.object({
  memberId: z.string().min(1),
  type: z.enum(["deposit", "rake_rebate", "adjustment"]),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  note: z.string().optional(),
});

export async function creditMember(formData: FormData): Promise<void> {
  const agent = await requireManager();
  const parsed = creditSchema.safeParse({
    memberId: formData.get("memberId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().creditMember({
    agentId: agent.id,
    memberId: parsed.data.memberId,
    type: parsed.data.type,
    amount: Math.round(parsed.data.amount * 100),
    note: parsed.data.note,
  });
  revalidatePath("/members");
}

const hoursSchema = z.object({
  memberId: z.string().min(1),
  hours: z.coerce.number().min(0, "Hours cannot be negative"),
});

export async function logMemberHours(formData: FormData): Promise<void> {
  const agent = await requireManager();
  const parsed = hoursSchema.safeParse({
    memberId: formData.get("memberId"),
    hours: formData.get("hours"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().setMemberTableHours(agent.id, parsed.data.memberId, parsed.data.hours);
  revalidatePath("/members");
}

/** A qualifying player requests agent status (admin approves). */
export async function requestAgentStatus(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  await getRepository().requestAgentStatus(user.id);
  revalidatePath("/dashboard");
}

/** Admin approves/rejects a pending agent request. */
export async function decideAgentRequest(userId: string, decision: "approved" | "rejected"): Promise<void> {
  const admin = await requireAdmin();
  await getRepository().decideAgentRequest(admin.id, userId, decision);
  revalidatePath("/admin");
}

export async function decideMemberTransaction(
  txId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const agent = await requireManager();
  await getRepository().decideMemberTransaction(agent.id, txId, decision);
  revalidatePath("/members");
}

// --- Admin controls --------------------------------------------------------

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export type ImportResult = { created?: number; errors?: string[]; error?: string };

/** Parse pasted CSV (username,full_name,email,role,upline_code,clubgg_id,balance) and create members. */
export async function importRoster(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const admin = await requireAdmin();
  const repo = getRepository();
  const text = String(formData.get("csv") ?? "").trim();
  if (!text) return { error: "Paste at least one CSV row" };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    if (i === 0 && cells[0].toLowerCase() === "username") continue; // skip header
    // All imported members are players (agent status is request → approval).
    const [username, fullName, email, uplineCode, clubggId, balance] = cells;
    if (!username) continue;
    try {
      await repo.createMember(admin.id, {
        username,
        fullName: fullName || username,
        email: email || `${username}@pokeragent.app`,
        uplineReferralCode: uplineCode || undefined,
        clubggId: clubggId || undefined,
        balance: balance ? Math.round(Number(balance) * 100) : undefined,
      });
      created += 1;
    } catch (e) {
      errors.push(`Row ${i + 1} (${username}): ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  revalidatePath("/admin");
  return { created, errors };
}

export async function setKyc(
  userId: string,
  status: "verified" | "rejected" | "pending",
): Promise<void> {
  const admin = await requireAdmin();
  await getRepository().setKycStatus(admin.id, userId, status);
  revalidatePath("/admin");
}

export async function setAccountStatus(
  userId: string,
  status: "active" | "suspended" | "banned",
): Promise<void> {
  const admin = await requireAdmin();
  await getRepository().setAccountStatus(admin.id, userId, status);
  revalidatePath("/admin");
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["player", "agent", "admin"]),
});

export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = roleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().setUserRole(admin.id, parsed.data.userId, parsed.data.role);
  revalidatePath("/admin");
}

const adjustSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().refine((n) => n !== 0, "Amount cannot be zero"),
  note: z.string().optional(),
});

export async function adminAdjustBalance(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adjustSchema.safeParse({
    userId: formData.get("userId"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().adminAdjustBalance(
    admin.id,
    parsed.data.userId,
    Math.round(parsed.data.amount * 100),
    parsed.data.note,
  );
  revalidatePath("/admin");
}
