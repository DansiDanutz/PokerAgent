import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { EconomyView, sumSessionTotals } from "@/components/admin/EconomyView";

/**
 * The club's economic book of record — see EconomyView. This page is the
 * container: admin gate + data loading; the view is pure presentation.
 */
export default async function EconomyPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; member?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const { session: sessionParam, member: memberParam } = await searchParams;

  const repo = getRepository();
  const [sessions, users] = await Promise.all([repo.listImportSessions(user.id), repo.listUsers()]);
  const nameById = new Map(users.map((u) => [u.id, u.username]));

  const detail = sessionParam ? await repo.getImportSession(user.id, sessionParam) : null;
  const memberHistory = memberParam ? await repo.listMemberImportHistory(user.id, memberParam) : null;

  return (
    <EconomyView
      sessions={sessions}
      allTime={sumSessionTotals(sessions)}
      detail={detail}
      memberHistory={memberHistory}
      memberName={memberParam ? (nameById.get(memberParam) ?? memberParam) : null}
      memberParam={memberParam}
      trackedMembers={users
        .filter((u) => u.role !== "admin")
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((u) => ({ id: u.id, username: u.username, role: u.role }))}
      nameById={nameById}
      currency={user.currency || "USD"}
    />
  );
}
