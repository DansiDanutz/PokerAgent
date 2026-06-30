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

export async function loginAs(userId: string): Promise<void> {
  const user = await getRepository().getUser(userId);
  if (!user) throw new Error("Unknown demo user");
  await setSession(user.id);
  redirect("/dashboard");
}

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username or email"),
});

export async function login(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const q = parsed.data.identifier.trim().toLowerCase();
  const users = await getRepository().listUsers();
  const match = users.find(
    (u) => u.username.toLowerCase() === q || u.email.toLowerCase() === q,
  );
  if (!match) throw new Error("No account found. Try a demo login below.");
  await setSession(match.id);
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
  referralCode: z.string().optional(),
});

export async function register(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    email: formData.get("email"),
    referralCode: formData.get("referralCode") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  // In the in-memory demo we route new sign-ups to the player persona so the
  // experience is explorable immediately. Production register() creates a
  // Supabase auth user (profile row is created by the DB trigger).
  await setSession("u_alex");
  redirect("/dashboard");
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

export async function promoteMember(memberId: string): Promise<void> {
  const agent = await requireManager();
  await getRepository().promoteToAgent(agent.id, memberId);
  revalidatePath("/members");
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
