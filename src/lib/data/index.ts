/**
 * Repository selection. Defaults to the in-memory seed driver so the app runs
 * with zero setup. Set DATA_DRIVER=supabase (plus Supabase env vars) to use a
 * persistent backend once the SupabaseRepository is wired up.
 *
 * The instance is cached on globalThis so the in-memory state survives Next.js
 * hot-reloads and is shared across server requests in a single process.
 *
 * DATA_DRIVER=supabase is a deliberate, security-relevant choice — the
 * in-memory driver seeds real-looking accounts with a known demo password.
 * If Supabase initialization fails, we fail closed (throw) instead of
 * silently downgrading to the in-memory driver, so a misconfigured
 * production deploy (missing/typo'd env var) can't accidentally serve a
 * seeded, guessable-credential store instead of erroring loudly.
 */

import { MemoryRepository } from "./memory";
import type { Repository } from "./repository";

const globalForRepo = globalThis as unknown as { __pokerRepo?: Repository };

export function getRepository(): Repository {
  if (globalForRepo.__pokerRepo) return globalForRepo.__pokerRepo;

  const driver = process.env.DATA_DRIVER ?? "memory";
  let repo: Repository;
  if (driver === "supabase") {
    // Lazy require so the in-memory path never pulls in the Supabase client.
    const { SupabaseRepository } = require("./supabase") as typeof import("./supabase");
    repo = new SupabaseRepository();
  } else {
    repo = new MemoryRepository();
  }

  globalForRepo.__pokerRepo = repo;
  return repo;
}

export type { Repository } from "./repository";
