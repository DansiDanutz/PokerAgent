/**
 * Shared auth check for /api/cron/* routes (server-only).
 *
 * Vercel Cron sends CRON_SECRET as `Authorization: Bearer <secret>`. Compared
 * with `timingSafeEqual` rather than `===` so a byte-by-byte timing
 * side-channel can't be used to recover the secret across many requests.
 */

import "server-only";
import { timingSafeEqual } from "node:crypto";

export function authorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // In local dev with no secret set, allow it so the route is testable.
  if (!secret) return process.env.NODE_ENV !== "production";

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
