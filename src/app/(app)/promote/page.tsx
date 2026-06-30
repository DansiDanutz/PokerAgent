import { getCurrentUser } from "@/lib/auth/session";
import { CLUB } from "@/lib/clubgg";
import { PromoteHub } from "@/components/promote/PromoteHub";

export default async function PromotePage() {
  const user = (await getCurrentUser())!;
  const referralLink = `https://pokeragent.app/r/${user.referralCode}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Promote &amp; grow</h1>
        <p className="text-sm text-ink-400">
          Share your link, post ready-made messages, and recruit members into your tree.
        </p>
      </div>
      <PromoteHub
        referralCode={user.referralCode}
        referralLink={referralLink}
        clubId={CLUB.clubId}
        clubName={CLUB.clubName}
      />
    </div>
  );
}
