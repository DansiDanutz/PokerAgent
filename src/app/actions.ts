"use server";

/**
 * Server actions — the write surface for the UI. All mutations funnel through
 * the repository and re-validate affected paths.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { parseClubggStats } from "@/lib/clubgg/statsImport";
import type { StatsImportPlan } from "@/lib/clubgg/distribution";
import { clearSession, getCurrentUser, setSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertNotLockedOut, clearFailedAttempts, recordFailedAttempt } from "@/lib/auth/rateLimit";

/**
 * Upper bound (in dollars, pre-cents) for any single money-schema field.
 * Combined with `.finite()`, this keeps `Infinity`/huge values out of
 * `Math.round(amount * 100)` before it ever reaches the repository — the
 * repository's own checks (and now DB-level CHECK constraints) are a second
 * line of defense, not the only one.
 */
const MAX_MONEY_AMOUNT = 1_000_000;
const moneyAmount = (label = "Amount") =>
  z.coerce.number().finite(`${label} must be a finite number`).max(MAX_MONEY_AMOUNT, `${label} is too large`);

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
  const rateLimitKey = `login:${parsed.data.email.trim().toLowerCase()}`;
  assertNotLockedOut(rateLimitKey);
  const cred = await getRepository().findAuthByEmail(parsed.data.email);
  // Same error whether the email is unknown or the password is wrong.
  if (!cred || !verifyPassword(parsed.data.password, cred.passwordHash)) {
    recordFailedAttempt(rateLimitKey);
    throw new Error("Invalid email or password");
  }
  clearFailedAttempts(rateLimitKey);
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

/** Best-effort caller IP from the headers Vercel/proxies set — falls back to a shared key locally. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Registration has no existing account to key a limiter off of, so it's
// throttled per source IP instead — looser than login/password (shared
// office/NAT IPs submitting a handful of real signups shouldn't get
// penalized), but still caps scripted mass account creation.
const REGISTER_THRESHOLDS = { windowMs: 60 * 60 * 1000, maxAttempts: 10, lockoutMs: 30 * 60 * 1000 };

export async function register(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const rateLimitKey = `register:${await clientIp()}`;
  assertNotLockedOut(rateLimitKey);
  recordFailedAttempt(rateLimitKey, REGISTER_THRESHOLDS);
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
    // Looser than login's threshold on purpose: this action is already
    // gated by a valid session (getCurrentUser above), so the credential-
    // stuffing threat model login/register defend against doesn't apply
    // here — a few mistyped-current-password retries by a legitimate user
    // shouldn't lock them out of fixing their own typo.
    const rateLimitKey = `changePassword:${user.id}`;
    assertNotLockedOut(rateLimitKey);
    const repo = getRepository();
    const cred = await repo.findAuthByEmail(user.email);
    if (!cred || !verifyPassword(parsed.data.currentPassword, cred.passwordHash)) {
      recordFailedAttempt(rateLimitKey, { windowMs: 15 * 60 * 1000, maxAttempts: 10, lockoutMs: 2 * 60 * 1000 });
      return { error: "Current password is incorrect" };
    }
    clearFailedAttempts(rateLimitKey);
    await repo.setPasswordHash(user.id, hashPassword(parsed.data.newPassword));
    return { error: undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change password" };
  }
}

const transferSchema = z.object({
  toReferralCode: z.string().min(1, "Enter the recipient's code"),
  amount: moneyAmount().positive("Amount must be greater than zero"),
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
  // Players self-deposit (admin approves). Withdrawals are now done by paying
  // back an agent via transfer(), not as an admin-approved cash request.
  type: z.enum(["deposit"]),
  amount: moneyAmount().positive("Amount must be greater than zero"),
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
    note: "Deposit request",
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  await getRepository().markNotificationRead(id, user.id);
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
  amount: moneyAmount().positive("Amount must be greater than zero"),
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
  hours: z.coerce.number().finite("Hours must be a finite number").min(0, "Hours cannot be negative").max(100_000, "Hours is too large"),
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

const changeUplineSchema = z.object({
  newReferralCode: z.string().min(1, "Enter the new agent's invite code"),
});

/** A dormant (1yr+ inactive) user moves themselves to a new agent. */
export async function changeUplineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not signed in");
    const parsed = changeUplineSchema.safeParse({ newReferralCode: formData.get("newReferralCode") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    await getRepository().changeUpline(user.id, parsed.data.newReferralCode);
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/members");
    return { error: undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change agent" };
  }
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

const creditLimitSchema = z.object({
  playerId: z.string().min(1),
  creditLimit: moneyAmount("Credit limit").min(0, "Credit limit cannot be negative"),
});

/** Agent (or admin) sets a per-player credit limit. */
export async function setPlayerCreditLimit(formData: FormData): Promise<void> {
  const actor = await requireManager();
  const parsed = creditLimitSchema.safeParse({
    playerId: formData.get("playerId"),
    creditLimit: formData.get("creditLimit"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().setPlayerCreditLimit(
    actor.id,
    parsed.data.playerId,
    Math.round(parsed.data.creditLimit * 100),
  );
  revalidatePath("/members");
  revalidatePath("/admin"); // admin sets agent credit lines from the console
}

const creditRequestSchema = z.object({
  amount: moneyAmount().positive("Amount must be greater than zero"),
  note: z.string().optional(),
});

/** An agent asks the admin for a credit line (recorded in settlement). */
export async function requestAgentCredit(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "agent") throw new Error("Agents only");
  const parsed = creditRequestSchema.safeParse({
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await getRepository().requestAgentCredit(
    user.id,
    Math.round(parsed.data.amount * 100),
    parsed.data.note,
  );
  revalidatePath("/members");
}

/** Admin approves/rejects a pending agent credit request. */
export async function decideAgentCredit(txId: string, decision: "approved" | "rejected"): Promise<void> {
  const admin = await requireAdmin();
  await getRepository().decideAgentCredit(admin.id, txId, decision);
  revalidatePath("/admin");
}

// --- Admin controls --------------------------------------------------------

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export type ImportResult = { created?: number; errors?: string[]; error?: string };

/**
 * Column names this importer recognizes, mapped to the field it fills.
 * Covers both the minimal paste format (username,full_name,email,upline_code,
 * clubgg_id,balance) and RosterTools' "Export CSV" reconciliation format
 * (which has more columns — role,kyc_status,status,rake_usd — in a different
 * order). Unrecognized columns (role, kyc_status, status, rake_usd) are
 * ignored rather than silently misread — imported members are always
 * players regardless, and the rest is admin-only reporting data.
 */
const ROSTER_COLUMN_ALIASES: Record<string, "username" | "fullName" | "email" | "uplineCode" | "clubggId" | "balance"> = {
  username: "username",
  full_name: "fullName",
  fullname: "fullName",
  email: "email",
  upline_code: "uplineCode",
  upline: "uplineCode",
  clubgg_id: "clubggId",
  clubggid: "clubggId",
  balance: "balance",
  balance_usd: "balance",
};

/** Parse pasted CSV and create members. See ROSTER_COLUMN_ALIASES for the recognized header names. */
export async function importRoster(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const admin = await requireAdmin();
  const repo = getRepository();
  const text = String(formData.get("csv") ?? "").trim();
  if (!text) return { error: "Paste at least one CSV row" };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let created = 0;
  const errors: string[] = [];

  // If the first row is a recognized header, map columns by name (handles
  // both the minimal import format and the richer "Export CSV" format, in
  // any column order). Otherwise fall back to the documented fixed-position
  // format for headerless pastes.
  const headerCells = lines[0]?.split(",").map((c) => c.trim().toLowerCase()) ?? [];
  const hasHeader = headerCells[0] === "username";
  const columnIndex: Partial<Record<"username" | "fullName" | "email" | "uplineCode" | "clubggId" | "balance", number>> = {};
  if (hasHeader) {
    headerCells.forEach((h, idx) => {
      const field = ROSTER_COLUMN_ALIASES[h];
      if (field && !(field in columnIndex)) columnIndex[field] = idx;
    });
  }

  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    let username: string | undefined;
    let fullName: string | undefined;
    let email: string | undefined;
    let uplineCode: string | undefined;
    let clubggId: string | undefined;
    let balance: string | undefined;
    if (hasHeader) {
      username = columnIndex.username !== undefined ? cells[columnIndex.username] : undefined;
      fullName = columnIndex.fullName !== undefined ? cells[columnIndex.fullName] : undefined;
      email = columnIndex.email !== undefined ? cells[columnIndex.email] : undefined;
      uplineCode = columnIndex.uplineCode !== undefined ? cells[columnIndex.uplineCode] : undefined;
      clubggId = columnIndex.clubggId !== undefined ? cells[columnIndex.clubggId] : undefined;
      balance = columnIndex.balance !== undefined ? cells[columnIndex.balance] : undefined;
    } else {
      // All imported members are players (agent status is request → approval).
      [username, fullName, email, uplineCode, clubggId, balance] = cells;
    }
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

// --- ClubGG stats import: paste CSV → preview distribution → apply ----------

/** Hard cap on rows a single import will parse — keeps a giant paste bounded. */
const MAX_IMPORT_ROWS = 5000;
/** Hard cap on files per batch — a day's tables, not a dump of history. */
const MAX_IMPORT_FILES = 30;

export type StatsImportFileResult = {
  fileName: string;
  plan: StatsImportPlan;
  parseWarnings: string[];
};

export type StatsImportState = {
  /** One result per imported file — one ClubGG export file = one session. */
  results?: StatsImportFileResult[];
  /** Set once an apply has committed, so the UI can show a success banner. */
  applied?: boolean;
  error?: string;
};

/**
 * One action drives both steps via a `mode` field: "preview" computes the
 * distribution without touching balances; "apply" commits it. Accepts MULTIPLE
 * export files (the daily per-table workflow: one Game Detail file per table)
 * — each file runs the FULL automation chain independently and becomes its own
 * persisted session. Applying always re-parses and re-computes server-side
 * from the submitted CSVs — the client never sends amounts, so a tampered
 * preview can't move money.
 */
export async function runStatsImport(_prev: StatsImportState, formData: FormData): Promise<StatsImportState> {
  const admin = await requireAdmin();
  const mode = formData.get("mode") === "apply" ? "apply" : "preview";

  // Gather inputs: uploaded files first, pasted CSV as a fallback "file".
  const inputs: Array<{ fileName: string; text: string }> = [];
  for (const f of formData.getAll("files")) {
    if (f instanceof File && f.size > 0) inputs.push({ fileName: f.name, text: await f.text() });
  }
  const pasted = String(formData.get("csv") ?? "").trim();
  if (pasted) inputs.push({ fileName: "Pasted CSV", text: pasted });
  if (inputs.length === 0) return { error: "Choose the ClubGG export file(s) or paste CSV rows first." };
  if (inputs.length > MAX_IMPORT_FILES) {
    return { error: `That's ${inputs.length} files — the per-batch cap is ${MAX_IMPORT_FILES}.` };
  }

  const repo = getRepository();
  const results: StatsImportFileResult[] = [];
  for (const input of inputs) {
    const { rows, warnings } = parseClubggStats(input.text);
    if (rows.length === 0) {
      return {
        error: `${input.fileName}: ${warnings[0] ?? "no usable rows found."}`,
        results: results.length > 0 ? results : undefined,
        applied: mode === "apply" && results.length > 0,
      };
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return { error: `${input.fileName} has ${rows.length} rows — the per-file cap is ${MAX_IMPORT_ROWS}.` };
    }
    try {
      const plan =
        mode === "apply"
          ? await repo.applyStatsImport(admin.id, rows, { sourceFile: input.fileName })
          : await repo.previewStatsImport(admin.id, rows);
      results.push({ fileName: input.fileName, plan, parseWarnings: warnings });
    } catch (e) {
      // Report which file failed; earlier files in an apply batch HAVE been
      // committed (each is an independent session) — say so honestly.
      return {
        error: `${input.fileName}: ${e instanceof Error ? e.message : "import failed"}${
          mode === "apply" && results.length > 0 ? ` (${results.length} earlier file(s) were already applied)` : ""
        }`,
        results: results.length > 0 ? results : undefined,
        applied: mode === "apply" && results.length > 0,
      };
    }
  }
  if (mode === "apply") revalidatePath("/admin");
  return { results, applied: mode === "apply" };
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
  amount: moneyAmount()
    .min(-MAX_MONEY_AMOUNT, "Amount is too large")
    .refine((n) => n !== 0, "Amount cannot be zero"),
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
