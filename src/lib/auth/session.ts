/**
 * Session handling (server-only).
 *
 * The session cookie holds the user id plus an HMAC signature, so it can't be
 * forged client-side. In production, SESSION_SECRET is required — we throw
 * rather than fall back to another secret (Supabase service-role key, whose
 * leak would then also forge sessions) or a hardcoded literal (which is
 * public, being in this repo). Outside production, an unset SESSION_SECRET
 * falls back to a dev-only constant so `npm run dev` needs no setup.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import type { Role, User } from "@/types/domain";

const COOKIE = "pa_session";

function signingKey(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. Refusing to sign session cookies with a fallback secret in production " +
        "(generate one with `openssl rand -base64 48` and set it in your deployment env).",
    );
  }
  return "pokeragent-dev-session-secret";
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
