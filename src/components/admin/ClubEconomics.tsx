import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { CLUB, clubIdConfigured, economicsIssues } from "@/lib/clubgg";
import { AGENT_RAKEBACK_TIERS, REFERRAL_RAKEBACK_TIERS, type RakebackTier } from "@/lib/levels";
import { formatPercent } from "@/lib/format";

function ladder(tiers: RakebackTier[]): string {
  return tiers.map((t) => `${formatPercent(t.rate, 0)} @ ${t.minVip}`).join("   ·   ");
}

/**
 * The single, read-only view of the club's money configuration — rake chain,
 * player rakeback and the two tier ladders — so the admin can confirm at a
 * glance that everything the distribution engine uses is set correctly. All
 * values come from NEXT_PUBLIC_CLUBGG_* env vars (+ the tier tables in levels).
 */
export function ClubEconomics() {
  const issues = economicsIssues();
  const idOk = clubIdConfigured();
  return (
    <Card glow="gold">
      <SectionTitle
        title="Club economics"
        subtitle="How rake is split & rebated — set via NEXT_PUBLIC_CLUBGG_* env vars"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Club ID" value={CLUB.clubId} tone="gold" hint={idOk ? "Live" : "placeholder"} />
        <Stat
          label="Rake split U / C / A"
          value={`${formatPercent(CLUB.rakeSplit.union, 0)} / ${formatPercent(CLUB.rakeSplit.club, 0)} / ${formatPercent(CLUB.rakeSplit.agent, 0)}`}
        />
        <Stat label="Player rakeback" value={formatPercent(CLUB.playerRakebackRate, 0)} tone="up" hint="own rake · L1+" />
        <Stat label="Union" value={CLUB.unionName || "—"} hint={CLUB.clubName} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
          <p className="text-xs font-semibold text-ink-200">Agent commission tiers</p>
          <p className="mt-1 font-mono text-[11px] text-ink-400">
            {ladder(AGENT_RAKEBACK_TIERS)} <span className="text-ink-600">VIP</span>
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
          <p className="text-xs font-semibold text-ink-200">Referral rakeback tiers</p>
          <p className="mt-1 font-mono text-[11px] text-ink-400">
            {ladder(REFERRAL_RAKEBACK_TIERS)} <span className="text-ink-600">VIP</span>
          </p>
        </div>
      </div>

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--color-warning)]">
          {issues.map((m, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {m}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-soft">
          <CheckCircle2 size={14} /> Economics configuration is valid.
        </p>
      )}

      {!idOk && (
        <p className="mt-2 text-xs text-[var(--color-warning)]">
          ⚠ Club ID is a placeholder — set <span className="font-mono">NEXT_PUBLIC_CLUBGG_CLUB_ID</span> to your real ClubGG club number.
        </p>
      )}
    </Card>
  );
}
