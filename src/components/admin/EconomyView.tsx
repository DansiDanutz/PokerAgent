import Link from "next/link";
import { ArrowLeft, Coins, History, LineChart, User as UserIcon } from "lucide-react";
import { Card, Stat, SectionTitle, Badge, EmptyState } from "@/components/ui";
import { RakeSplitBar } from "@/components/clubgg/RakeSplitBar";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import type {
  DistributionTotals,
  ImportSessionDetail,
  ImportSessionSummary,
  MemberSessionHistoryEntry,
} from "@/lib/clubgg/distribution";

export interface EconomyMemberOption {
  id: string;
  username: string;
  role: string;
}

export interface EconomyViewProps {
  sessions: ImportSessionSummary[];
  /** Sum of every session's totals — the all-time economy. */
  allTime: DistributionTotals;
  /** Selected session detail (?session=), if any. */
  detail: ImportSessionDetail | null;
  /** Selected member history (?member=), if any. */
  memberHistory: MemberSessionHistoryEntry[] | null;
  memberName: string | null;
  memberParam?: string;
  trackedMembers: EconomyMemberOption[];
  nameById: Map<string, string>;
  currency: string;
}

/** Sum every session's totals into the all-time economy figures. */
export function sumSessionTotals(sessions: ImportSessionSummary[]): DistributionTotals {
  return sessions.reduce<DistributionTotals>(
    (acc, s) => ({
      members: Math.max(acc.members, s.totals.members),
      matched: 0,
      unmatched: 0,
      hands: acc.hands + s.totals.hands,
      rake: acc.rake + s.totals.rake,
      playerRakeback: acc.playerRakeback + s.totals.playerRakeback,
      commission: acc.commission + s.totals.commission,
      adminKept: acc.adminKept + s.totals.adminKept,
      payToAgents: acc.payToAgents + s.totals.payToAgents,
      collectFromAgents: acc.collectFromAgents + s.totals.collectFromAgents,
    }),
    { members: 0, matched: 0, unmatched: 0, hands: 0, rake: 0, playerRakeback: 0, commission: 0, adminKept: 0, payToAgents: 0, collectFromAgents: 0 },
  );
}

/**
 * The club's economic book of record, rendered from persisted import
 * sessions: all-time rake split (players / agents / admin), per-day session
 * history, per-session member detail, and any member's hands/rake/P&L across
 * periods. Pure presentational — the admin page (and tests) supply the data.
 */
export function EconomyView({
  sessions,
  allTime,
  detail,
  memberHistory,
  memberName,
  memberParam,
  trackedMembers,
  nameById,
  currency,
}: EconomyViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-100">
            <LineChart size={22} className="text-gold-300" /> Club economy
          </h1>
          <p className="text-sm text-ink-400">Every session, every dollar of rake, every player — tracked.</p>
        </div>
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100">
          <ArrowLeft size={15} /> Admin console
        </Link>
      </div>

      {/* All-time economy */}
      <Card glow="gold">
        <SectionTitle title="All-time economy" subtitle={`Across ${sessions.length} applied session${sessions.length === 1 ? "" : "s"}`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sessions" value={formatNumber(sessions.length)} />
          <Stat label="Hands" value={formatNumber(allTime.hands)} />
          <Stat label="Total rake" value={formatMoney(allTime.rake, currency)} tone="gold" />
          <Stat label="Player rake" value={formatMoney(allTime.playerRakeback, currency)} tone="up" />
          <Stat label="Agent rake" value={formatMoney(allTime.commission, currency)} tone="up" />
          <Stat label="Admin rake" value={formatMoney(allTime.adminKept, currency)} tone="gold" />
        </div>
        {allTime.rake > 0 && (
          <div className="mt-4">
            <RakeSplitBar
              rake={allTime.rake}
              players={allTime.playerRakeback}
              agents={allTime.commission}
              admin={allTime.adminKept}
              currency={currency}
              title="All-time rake split"
            />
          </div>
        )}
        {(allTime.payToAgents > 0 || allTime.collectFromAgents > 0) && (
          <p className="mt-3 text-xs text-ink-500">
            Game money moved through you all-time: paid{" "}
            <span className="text-emerald-soft">{formatMoney(allTime.payToAgents, currency)}</span> to winning agents,
            collected <span className="text-[var(--color-warning)]">{formatMoney(allTime.collectFromAgents, currency)}</span>{" "}
            from losing agents.
          </p>
        )}
      </Card>

      {/* Session history */}
      <Card>
        <SectionTitle title="Sessions" subtitle="Each applied import is one period — click to open its full detail" />
        {sessions.length === 0 ? (
          <EmptyState>
            No sessions yet. Apply a ClubGG stats import from the <Link href="/admin" className="text-emerald-soft underline">admin console</Link> — every apply is recorded here permanently.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-white/5">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-white/[0.03] text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 text-right font-medium">Members</th>
                  <th className="px-3 py-2 text-right font-medium">Hands</th>
                  <th className="px-3 py-2 text-right font-medium">Rake</th>
                  <th className="px-3 py-2 text-right font-medium">Players</th>
                  <th className="px-3 py-2 text-right font-medium">Agents</th>
                  <th className="px-3 py-2 text-right font-medium">Admin</th>
                  <th className="px-3 py-2 text-right font-medium">Game pay / collect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map((s) => (
                  <tr key={s.id} className={detail?.id === s.id ? "bg-gold-500/5" : ""}>
                    <td className="px-3 py-2">
                      <Link href={`/admin/economy?session=${s.id}`} className="flex items-center gap-1.5 text-ink-100 hover:text-gold-300">
                        <History size={12} className="text-ink-500" /> {formatDate(s.createdAt)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-300">
                      {s.totals.matched}/{s.totals.members}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatNumber(s.totals.hands)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gold-300">{formatMoney(s.totals.rake, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-soft">{formatMoney(s.totals.playerRakeback, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-200">{formatMoney(s.totals.commission, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-400">{formatMoney(s.totals.adminKept, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-400">
                      <span className="text-emerald-soft">{formatMoney(s.totals.payToAgents, currency)}</span>
                      {" / "}
                      <span className="text-[var(--color-warning)]">{formatMoney(s.totals.collectFromAgents, currency)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Session detail */}
      {detail && (
        <Card glow="emerald">
          <SectionTitle
            title={detail.label}
            subtitle={`${formatDate(detail.createdAt)} · ${detail.totals.matched}/${detail.totals.members} members · ${formatNumber(detail.totals.hands)} hands`}
            action={<Badge tone="gold">{formatMoney(detail.totals.rake, currency)} rake</Badge>}
          />
          <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-white/5">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-white/[0.03] text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Table</th>
                  <th className="px-3 py-2 text-right font-medium">Hands</th>
                  <th className="px-3 py-2 text-right font-medium">Hours</th>
                  <th className="px-3 py-2 text-right font-medium">Rake</th>
                  <th className="px-3 py-2 text-right font-medium">Rakeback</th>
                  <th className="px-3 py-2 text-right font-medium">Agents</th>
                  <th className="px-3 py-2 text-right font-medium">Admin</th>
                  <th className="px-3 py-2 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {detail.lines.map((l, i) => {
                  const label = l.userId ? `@${nameById.get(l.userId) ?? l.username ?? l.userId}` : (l.nickname ?? l.clubggId);
                  return (
                    <tr key={`${l.clubggId}-${i}`} className={l.matched ? "" : "opacity-50"}>
                      <td className="px-3 py-2">
                        {l.userId ? (
                          <Link href={`/admin/economy?member=${l.userId}`} className="text-ink-100 hover:text-emerald-soft">
                            {label}
                          </Link>
                        ) : (
                          <span className="text-ink-400">{label} <Badge tone="warning">unlinked</Badge></span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-400">
                        {l.tableName ?? "—"}
                        {l.gameType && <span className="text-ink-600"> · {l.gameType}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatNumber(l.handsPlayed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-300">{l.tableHours || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gold-300">{formatMoney(l.rake, currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-soft">
                        {l.playerRakeback > 0 ? formatMoney(l.playerRakeback, currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-300">
                        {l.agentShare > 0 ? formatMoney(l.agentShare, currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-400">{formatMoney(l.adminShare, currency)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${l.netProfit >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                        {l.netProfit >= 0 ? "+" : "−"}{formatMoney(Math.abs(l.netProfit), currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Per-member history */}
      <Card>
        <SectionTitle
          title="Player history"
          subtitle="Any member's hands, rake, rakeback and results — session by session"
        />
        <form action="/admin/economy" method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <UserIcon size={15} className="text-ink-500" />
          <select
            name="member"
            defaultValue={memberParam ?? ""}
            className="rounded-xl bg-felt-900 px-3.5 py-2 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10"
          >
            <option value="" disabled>
              Choose a member…
            </option>
            {trackedMembers.map((m) => (
              <option key={m.id} value={m.id}>
                @{m.username} ({m.role})
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-emerald-glow/15 px-4 py-2 text-sm font-medium text-emerald-soft hover:bg-emerald-glow/25">
            View history
          </button>
        </form>

        {memberHistory && memberName && (
          memberHistory.length === 0 ? (
            <EmptyState>@{memberName} hasn&apos;t appeared in any imported session yet.</EmptyState>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Sessions" value={formatNumber(memberHistory.length)} />
                <Stat label="Hands" value={formatNumber(memberHistory.reduce((s, e) => s + e.line.handsPlayed, 0))} />
                <Stat label="Rake generated" value={formatMoney(memberHistory.reduce((s, e) => s + e.line.rake, 0), currency)} tone="gold" />
                {(() => {
                  const pnl = memberHistory.reduce((s, e) => s + e.line.netProfit, 0);
                  return (
                    <Stat
                      label="Net result"
                      value={`${pnl >= 0 ? "+" : "−"}${formatMoney(Math.abs(pnl), currency)}`}
                      tone={pnl >= 0 ? "up" : "down"}
                    />
                  );
                })()}
              </div>
              <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-white/5">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-white/[0.03] text-ink-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Session</th>
                      <th className="px-3 py-2 text-right font-medium">Hands</th>
                      <th className="px-3 py-2 text-right font-medium">Hours</th>
                      <th className="px-3 py-2 text-right font-medium">Buy-in</th>
                      <th className="px-3 py-2 text-right font-medium">Cash-out</th>
                      <th className="px-3 py-2 text-right font-medium">Rake</th>
                      <th className="px-3 py-2 text-right font-medium">Rakeback</th>
                      <th className="px-3 py-2 text-right font-medium">P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {memberHistory.map((e) => (
                      <tr key={e.session.id}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/economy?session=${e.session.id}&member=${memberParam}`} className="flex items-center gap-1.5 text-ink-100 hover:text-gold-300">
                            <Coins size={12} className="text-ink-500" /> {formatDate(e.session.createdAt)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatNumber(e.line.handsPlayed)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-300">{e.line.tableHours || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatMoney(e.line.buyIn, currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-300">{formatMoney(e.line.cashOut, currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gold-300">{formatMoney(e.line.rake, currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-soft">
                          {e.line.playerRakeback > 0 ? formatMoney(e.line.playerRakeback, currency) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${e.line.netProfit >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                          {e.line.netProfit >= 0 ? "+" : "−"}{formatMoney(Math.abs(e.line.netProfit), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </Card>
    </div>
  );
}
