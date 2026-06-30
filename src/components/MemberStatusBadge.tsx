import { clsx } from "clsx";
import type { MemberStatus } from "@/types/domain";
import { STATUS_LABEL } from "@/lib/levels";

const TONE: Record<MemberStatus, string> = {
  new_player: "bg-white/8 text-ink-300 ring-white/10",
  player: "bg-emerald-glow/15 text-emerald-soft ring-emerald-glow/30",
  vip_player: "bg-gold-500/15 text-gold-300 ring-gold-500/30",
};

export function MemberStatusBadge({ status, level }: { status: MemberStatus; level?: number }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONE[status],
      )}
    >
      {level !== undefined && <span className="opacity-70">L{level}</span>}
      {STATUS_LABEL[status]}
    </span>
  );
}
