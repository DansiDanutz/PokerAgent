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
}

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

/**
 * The active club. Override any field with NEXT_PUBLIC_CLUBGG_* env vars.
 * `clubId` defaults to a placeholder — set NEXT_PUBLIC_CLUBGG_CLUB_ID to the
 * real numeric id from your ClubGG agent panel.
 */
export const CLUB: ClubConfig = {
  clubId: env("NEXT_PUBLIC_CLUBGG_CLUB_ID", "000000"),
  clubName: env("NEXT_PUBLIC_CLUBGG_CLUB_NAME", "Poker Agent Club"),
  unionName: env("NEXT_PUBLIC_CLUBGG_UNION_NAME", "Poker Agent Union"),
  inviteLink: env("NEXT_PUBLIC_CLUBGG_INVITE_LINK", "https://clubgg.app.link/mzgF64Tyo4b"),
  iosAppUrl: "https://apps.apple.com/app/clubgg/id1521240943",
  androidAppUrl: "https://play.google.com/store/apps/details?id=com.ggnetwork.clubgg",
  webUrl: "https://www.clubgg.com/",
  rakeSplit: {
    union: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_UNION", "0.1")),
    club: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_CLUB", "0.3")),
    agent: Number(env("NEXT_PUBLIC_CLUBGG_RAKE_AGENT", "0.2")),
  },
};

/** True when the operator hasn't set a real Club ID yet. */
export function clubIdConfigured(): boolean {
  return CLUB.clubId !== "000000" && /^\d{4,}$/.test(CLUB.clubId);
}

/** Apply the agent's rake share to an amount of rake (minor units). */
export function agentRakeShare(rakeMinor: number): number {
  return Math.round(rakeMinor * CLUB.rakeSplit.agent);
}
