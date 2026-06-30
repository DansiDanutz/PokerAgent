/**
 * Session handling (server-only).
 *
 * The session cookie holds the user id plus an HMAC signature, so it can't be
 * forged client-side. The signing key is derived from SESSION_SECRET, falling
 * back to the Supabase service-role key (already a server-only secret), then a
 * dev constant for local zero-config runs.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import type { Role, User } from "@/types/domain";

const COOKIE = "pa_session";

function signingKey(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "pokeragent-dev-session-secret"
  );
}

function sign(userId: string): string {
  const sig = createHmac("sha256", signingKey()).update(userId).digest("base64url");
  return `${userId}.${sig}`;
}

function verify(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", signingKey()).update(userId).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  return token ? verify(token) : null;
}

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const id = await getSessionUserId();
  if (!id) return null;
  return getRepository().getUser(id);
}

export async function requireRole(roles: Role[]): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return roles.includes(user.role) ? user : null;
}
