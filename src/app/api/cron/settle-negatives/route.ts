/**
 * Daily negative-balance settlement (Vercel Cron).
 *
 * Sweeps every player's negative balance onto their direct agent, then notifies
 * the player, the agent, and (when the agent is pushed negative) the admin.
 *
 * Protected by CRON_SECRET — Vercel Cron sends it as `Authorization: Bearer …`.
 * Manually invokable in dev with the same header.
 */

import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { ADMIN_EMAIL } from "@/lib/governance";
import { authorizedCronRequest } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!authorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = getRepository();
  const sweeps = await repo.sweepNegativeBalances();

  // Resolve the admin once, for escalation notices.
  const admin = (await repo.listUsers({ role: "admin" })).find((u) => u.email === ADMIN_EMAIL);

  for (const s of sweeps) {
    const [player, agent] = await Promise.all([repo.getUser(s.playerId), repo.getUser(s.agentId)]);
    const amount = formatMoney(s.amount, agent?.currency ?? "USD");

    await repo.addNotification({
      userId: s.playerId,
      kind: "money",
      title: "Negative balance settled",
      body: `Your ${amount} shortfall was settled by your agent. Your balance is back to $0.00.`,
    });
    await repo.addNotification({
      userId: s.agentId,
      kind: "money",
      title: "You absorbed a player shortfall",
      body: `${player?.fullName ?? "A player"}'s ${amount} negative balance was charged to your account.`,
    });

    if (s.agentNowNegative) {
      await repo.addNotification({
        userId: s.agentId,
        kind: "security",
        title: "Your balance is negative",
        body: "You can't request new credit or earn commission until you settle it. Collect from your players or request credit once positive.",
      });
      if (admin) {
        await repo.addNotification({
          userId: admin.id,
          kind: "security",
          title: "Agent balance went negative",
          body: `${agent?.fullName ?? "An agent"} is now negative after settling ${player?.fullName ?? "a player"}'s shortfall.`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, swept: sweeps.length, sweeps });
}
