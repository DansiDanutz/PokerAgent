import { Info } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { CLUB } from "@/lib/clubgg";
import { Card } from "@/components/ui";
import { PromoteHub } from "@/components/promote/PromoteHub";
import { currentLevel, canEarnReferrals, VIP_TABLE_HOURS } from "@/lib/levels";

export default async function PromotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const referralLink = `https://pokeragent.app/r/${user.referralCode}`;

  // Everyone can refer friends — but earning commission from your own
  // network requires YOU to be VIP (L2+). Players below that still get the
  // full sharing toolkit, just with a heads-up about when the money starts.
  let showEarningsHint = false;
  let level = 0;
  if (user.role === "player") {
    const summary = await getRepository().getNetworkSummary(user.id);
    const inputs = {
      kycVerified: user.kycStatus === "verified",
      tableHours: user.stats.tableHours,
      directReferrals: summary.directReferrals,
    };
    level = currentLevel(inputs).level;
    showEarningsHint = !canEarnReferrals(inputs);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Promote &amp; grow</h1>
        <p className="text-sm text-ink-400">
          Share your link, post ready-made messages, and recruit members into your tree.
        </p>
      </div>

      {showEarningsHint && (
        <Card glow="ember">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ember-500/15">
              <Info size={16} className="text-ember-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-100">Referral earnings unlock at VIP (Level 2)</p>
              <p className="mt-1 text-xs text-ink-400">
                You&apos;re currently Level {level} — share away, every referral still grows your tree.
                Verify KYC and play {VIP_TABLE_HOURS}+ table hours to reach VIP, which is when you start
                earning commission from your network&apos;s rake.
              </p>
            </div>
          </div>
        </Card>
      )}

      <PromoteHub
        referralCode={user.referralCode}
        referralLink={referralLink}
        clubId={CLUB.clubId}
        clubName={CLUB.clubName}
      />
    </div>
  );
}
