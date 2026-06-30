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
  switch (driver) {
    case "supabase":
      // SupabaseRepository implements the same interface against the schema in
      // supabase/migrations. Falls back to memory until configured to avoid a
      // broken runtime in local/demo environments.
      console.warn(
        "[data] DATA_DRIVER=supabase requested but SupabaseRepository is not " +
          "configured; falling back to the in-memory driver.",
      );
      repo = new MemoryRepository();
      break;
    case "memory":
    default:
      repo = new MemoryRepository();
  }

  globalForRepo.__pokerRepo = repo;
  return repo;
}

export type { Repository } from "./repository";
