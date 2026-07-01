/**
 * Dormancy rules: any user who hasn't been active in over a year is free to
 * leave their current agent and attach to a new one (`changeUpline`). Agents
 * are surfaced these dormant members so they know who's about to age out.
 */

export const DORMANCY_DAYS = 365;

const MS_PER_DAY = 86_400_000;

/** Whole days between the user's last known activity and `now`. */
export function daysSinceActive(lastActiveAt: string | undefined, now: Date, createdAt?: string): number {
  const reference = lastActiveAt ?? createdAt;
  if (!reference) return 0;
  return Math.floor((now.getTime() - new Date(reference).getTime()) / MS_PER_DAY);
}

/** True once a user has gone `DORMANCY_DAYS`+ without activity. */
export function isDormant(lastActiveAt: string | undefined, now: Date, createdAt?: string): boolean {
  return daysSinceActive(lastActiveAt, now, createdAt) >= DORMANCY_DAYS;
}
