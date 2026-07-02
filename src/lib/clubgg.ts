/**
 * ClubGG integration config.
 *
 * ClubGG (clubgg.com, powered by GGPoker) is a closed social-poker app with NO
 * public management API. Poker Agent is therefore the *book of record* for the
 * club's people and money; chip top-ups are mirrored manually in the ClubGG
 * agent panel. This module centralizes the club's identity and the rake chain
 * so it can be configured per deployment via env vars.
 */

export interface RakeSplit {
  /** Share kept by the union running the network (0..1). */
  union: number;
  /** Share kept by the club. */
  club: number;
  /** Share allocated to the agent (the source of rakeback). */
  agent: number;
}

export interface ClubConfig {
  /** Numeric ClubGG Club ID players enter to join (from your agent panel). */
  clubId: string;
  clubName: string;
  unionName: string;
  /** Branch invite link that opens the club in the ClubGG app. */
  inviteLink: string;
  iosAppUrl: string;
  androidAppUrl: string;
  webUrl: string;
  rakeSplit: RakeSplit;
  /**
   * A player's PERSONAL rakeback rate (0..1) on their own generated rake —
   * paid to KYC-eligible (L1+) players when a stats period is imported. The
   * single source of truth for the distribution engine's player rebate.
   */
  playerRakebackRate: number;
}

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

/**
 * The active club. Override any field with NEXT_PUBLIC_CLUBGG_* env vars.
 * `clubId` defaults to a placeholder — set NEXT_PUBLIC_CLUBGG_CLUB_ID to the
 * real numeric id from your ClubGG agent panel.
 */
export const CLUB: ClubConfig = {
  clubId: env("NEXT_PUBLIC_CLUBGG_CLUB_ID", "358346"),
  clubName: env("NEXT_PUBLIC_CLUBGG_CLUB_NAME", "Players Poker"),
  unionName: env("NEXT_PUBLIC_CLUBGG_UNION_NAME", ""),
  inviteLink: env("NEXT_PUBLIC_CLUBGG_INVITE_LINK", "https://clubgg.app.link/mzgF64Tyo4b"),
  iosAppUrl: "https://apps.apple.com/app/clubgg/id1521240943",
  androidAppUrl: "https://play.google.com/store/apps/details?id=com.ggnetwork.clubgg",
  webUrl: "https://www.clubgg.com/",
  rakeSplit: {
    union: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_UNION", "0.1")),
    club: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_CLUB", "0.3")),
    agent: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_AGENT", "0.2")),
  },
  playerRakebackRate: Number(env("NEXT_PUBLIC_CLUBGG_PLAYER_RAKEBACK", "0.1")),
};

/** True when a real numeric Club ID is set. */
export function clubIdConfigured(): boolean {
  return CLUB.clubId !== "000000" && /^\d{4,}$/.test(CLUB.clubId);
}

/** Apply the agent's rake share to an amount of rake (minor units). */
export function agentRakeShare(rakeMinor: number): number {
  return Math.round(rakeMinor * CLUB.rakeSplit.agent);
}

/**
 * Coherence check for the configured economics, surfaced on the admin panel so
 * a misconfigured env var (e.g. a rate typed as `10` instead of `0.1`, or
 * shares that add past 100%) is caught before it distorts a distribution.
 */
export function economicsIssues(): string[] {
  const issues: string[] = [];
  const { union, club, agent } = CLUB.rakeSplit;
  const rates: Array<[string, number]> = [
    ["Union share", union],
    ["Club share", club],
    ["Agent share", agent],
    ["Player rakeback", CLUB.playerRakebackRate],
  ];
  for (const [label, r] of rates) {
    if (!Number.isFinite(r) || r < 0 || r > 1) issues.push(`${label} must be a fraction between 0 and 1 (got ${r}).`);
  }
  const chain = union + club + agent;
  if (Number.isFinite(chain) && chain > 1.0001) {
    issues.push(`Rake chain shares add up to ${(chain * 100).toFixed(0)}% — union + club + agent can't exceed 100%.`);
  }
  return issues;
}
