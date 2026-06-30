/**
 * Repository selection. Defaults to the in-memory seed driver so the app runs
 * with zero setup. Set DATA_DRIVER=supabase (plus Supabase env vars) to use a
 * persistent backend once the SupabaseRepository is wired up.
 *
 * The instance is cached on globalThis so the in-memory state survives Next.js
 * hot-reloads and is shared across server requests in a single process.
 */

import { MemoryRepository } from "./memory";
import type { Repository } from "./repository";

const globalForRepo = globalThis as unknown as { __pokerRepo?: Repository };

export function getRepository(): Repository {
  if (globalForRepo.__pokerRepo) return globalForRepo.__pokerRepo;

  const driver = process.env.DATA_DRIVER ?? "memory";
  let repo: Repository;
  if (driver === "supabase") {
    try {
      // Lazy require so the in-memory path never pulls in the Supabase client.
      const { SupabaseRepository } = require("./supabase") as typeof import("./supabase");
      repo = new SupabaseRepository();
    } catch (e) {
      console.warn(
        `[data] DATA_DRIVER=supabase but the Supabase client could not be initialized ` +
          `(${e instanceof Error ? e.message : "unknown error"}); falling back to in-memory.`,
      );
      repo = new MemoryRepository();
    }
  } else {
    repo = new MemoryRepository();
  }

  globalForRepo.__pokerRepo = repo;
  return repo;
}

export type { Repository } from "./repository";
