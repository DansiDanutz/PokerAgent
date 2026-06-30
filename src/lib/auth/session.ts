/**
 * Session handling (server-only).
 *
 * For the zero-setup demo this is a signed-cookie session holding the user id.
 * In production with Supabase auth, swap `getCurrentUser` to read the Supabase
 * session — the rest of the app depends only on the returned `User`.
 */

import "server-only";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import type { Role, User } from "@/types/domain";

const COOKIE = "pa_session";

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
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

/** Throws-style guard for server components: returns the user or null to redirect. */
export async function requireRole(roles: Role[]): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return roles.includes(user.role) ? user : null;
}
