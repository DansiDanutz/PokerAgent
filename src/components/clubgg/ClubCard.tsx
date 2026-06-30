import { CLUB, clubIdConfigured } from "@/lib/clubgg";
import { JoinClubCard } from "./JoinClubCard";

/** Server wrapper that feeds the active club config into the client card. */
export function ClubCard() {
  return (
    <JoinClubCard
      clubId={CLUB.clubId}
      clubName={CLUB.clubName}
      unionName={CLUB.unionName}
      inviteLink={CLUB.inviteLink}
      iosAppUrl={CLUB.iosAppUrl}
      androidAppUrl={CLUB.androidAppUrl}
      configured={clubIdConfigured()}
    />
  );
}
