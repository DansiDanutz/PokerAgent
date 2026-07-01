/**
 * Lightweight in-memory attempt limiter (server-only).
 *
 * Not a substitute for a shared store (Upstash/KV) under horizontal scaling —
 * each cold serverless instance starts with its own counters. But Vercel's
 * Fluid Compute reuses warm instances across requests, and this is a real
 * improvement over the previous "no throttling at all" on login/password
 * endpoints, at zero added infrastructure. Cached on globalThis so it
 * survives Next.js hot-reloads, matching the pattern in lib/data/index.ts.
 */

import "server-only";

type Entry = { count: number; windowStart: number; lockedUntil?: number };

type Thresholds = { windowMs: number; maxAttempts: number; lockoutMs: number };

const DEFAULT_THRESHOLDS: Thresholds = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  lockoutMs: 15 * 60 * 1000,
};

const globalForLimiter = globalThis as unknown as { __pokerAttempts?: Map<string, Entry> };

function store(): Map<string, Entry> {
  if (!globalForLimiter.__pokerAttempts) globalForLimiter.__pokerAttempts = new Map();
  return globalForLimiter.__pokerAttempts;
}

/** Throws a generic error if `key` is currently locked out. */
export function assertNotLockedOut(key: string): void {
  const entry = store().get(key);
  if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
    throw new Error("Too many attempts. Try again in a few minutes.");
  }
}

/**
 * Call once per attempt at a rate-limited action (a failed login/password
 * check, or every registration submission regardless of outcome — the
 * resource being protected is the attempt itself, not just failures).
 */
export function recordFailedAttempt(key: string, thresholds: Thresholds = DEFAULT_THRESHOLDS): void {
  const now = Date.now();
  const s = store();
  const entry = s.get(key);
  if (!entry || now - entry.windowStart > thresholds.windowMs) {
    s.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= thresholds.maxAttempts) {
    entry.lockedUntil = now + thresholds.lockoutMs;
  }
}

/** Call after a successful attempt to reset the counter. */
export function clearFailedAttempts(key: string): void {
  store().delete(key);
}
