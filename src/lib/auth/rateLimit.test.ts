import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertNotLockedOut, recordFailedAttempt, clearFailedAttempts } from "./rateLimit";

const globalForLimiter = globalThis as unknown as { __pokerAttempts?: Map<string, unknown> };

beforeEach(() => {
  // Isolate every test from shared globalThis state.
  globalForLimiter.__pokerAttempts = new Map();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("assertNotLockedOut", () => {
  it("does not throw for a key with no recorded attempts", () => {
    expect(() => assertNotLockedOut("fresh-key")).not.toThrow();
  });

  it("does not throw after attempts under the lockout threshold", () => {
    const key = "under-threshold";
    recordFailedAttempt(key, { windowMs: 60_000, maxAttempts: 5, lockoutMs: 60_000 });
    recordFailedAttempt(key, { windowMs: 60_000, maxAttempts: 5, lockoutMs: 60_000 });
    expect(() => assertNotLockedOut(key)).not.toThrow();
  });
});

describe("recordFailedAttempt", () => {
  it("locks out once maxAttempts is reached within the window", () => {
    const key = "hits-max-attempts";
    const thresholds = { windowMs: 60_000, maxAttempts: 3, lockoutMs: 60_000 };

    recordFailedAttempt(key, thresholds);
    recordFailedAttempt(key, thresholds);
    expect(() => assertNotLockedOut(key)).not.toThrow();

    recordFailedAttempt(key, thresholds); // 3rd attempt hits maxAttempts
    expect(() => assertNotLockedOut(key)).toThrow(
      "Too many attempts. Try again in a few minutes."
    );
  });

  it("stays locked out until lockoutMs has elapsed", () => {
    const key = "lockout-expiry";
    const thresholds = { windowMs: 60_000, maxAttempts: 2, lockoutMs: 30_000 };

    recordFailedAttempt(key, thresholds);
    recordFailedAttempt(key, thresholds);
    expect(() => assertNotLockedOut(key)).toThrow();

    // Not yet past lockoutMs.
    vi.advanceTimersByTime(29_999);
    expect(() => assertNotLockedOut(key)).toThrow();

    // Past lockoutMs — no longer locked out.
    vi.advanceTimersByTime(2);
    expect(() => assertNotLockedOut(key)).not.toThrow();
  });

  it("resets the count instead of accumulating once the window has elapsed", () => {
    const key = "stale-window-reset";
    const thresholds = { windowMs: 1_000, maxAttempts: 3, lockoutMs: 60_000 };

    recordFailedAttempt(key, thresholds);
    recordFailedAttempt(key, thresholds);

    // Let the sliding window go stale — the next attempt should restart the
    // counter at 1 rather than tripping the lockout at count 3.
    vi.advanceTimersByTime(1_001);
    recordFailedAttempt(key, thresholds);

    expect(() => assertNotLockedOut(key)).not.toThrow();
  });

  it("uses default thresholds when none are provided", () => {
    const key = "default-thresholds";
    // Defaults: maxAttempts 5, windowMs/lockoutMs 15 minutes.
    for (let i = 0; i < 4; i++) recordFailedAttempt(key);
    expect(() => assertNotLockedOut(key)).not.toThrow();

    recordFailedAttempt(key); // 5th attempt trips the default lockout
    expect(() => assertNotLockedOut(key)).toThrow();
  });
});

describe("clearFailedAttempts", () => {
  it("resets the counter so a previously near-limit key is no longer locked out", () => {
    const key = "cleared-key";
    const thresholds = { windowMs: 60_000, maxAttempts: 2, lockoutMs: 60_000 };

    recordFailedAttempt(key, thresholds);
    clearFailedAttempts(key);
    recordFailedAttempt(key, thresholds);

    // Only 1 attempt since the clear — should not be locked out even though
    // 2 total attempts were recorded across the key's lifetime.
    expect(() => assertNotLockedOut(key)).not.toThrow();
  });

  it("is a no-op when called on a key with no recorded attempts", () => {
    expect(() => clearFailedAttempts("never-recorded")).not.toThrow();
  });
});
