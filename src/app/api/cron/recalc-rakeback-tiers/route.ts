/**
 * Monthly agent rakeback-tier recalculation (Vercel Cron).
 *
 * Locks in each agent's rakeback rate for the new month based on VIP
 * players who played 20h+ during the month that just ended, then resets
 * the hours-snapshot baseline for every user.
 *
 * Protected by CRON_SECRET — Vercel Cron sends it as `Authorization: Bearer …`.
 * Manually invokable in dev with the same header.
 */

import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { authorizedCronRequest } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!authorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = getRepository();
  const changes = await repo.recalculateMonthlyRakebackTiers();

  for (const c of changes) {
    if (c.newRate === c.previousRate) continue;
    const direction = c.newRate > c.previousRate ? "increased" : "changed";
    await repo.addNotification({
      userId: c.agentId,
      kind: "money",
      title: `Your rakeback rate is now ${Math.round(c.newRate * 100)}%`,
      body: `Based on ${c.qualifiedVipCount} VIP players who played 20h+ last month, your rate ${direction} from ${Math.round(c.previousRate * 100)}% to ${Math.round(c.newRate * 100)}%.`,
    });
  }

  return NextResponse.json({ ok: true, agents: changes.length, changes });
}
