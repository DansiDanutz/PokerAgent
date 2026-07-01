"use client";

import { UserPlus } from "lucide-react";
import type { NetworkNode } from "@/types/domain";
import { Avatar, Badge } from "@/components/ui";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { currentLevel, memberStatus } from "@/lib/levels";
import { buildWhatsAppInviteLink } from "@/lib/whatsapp";

/** Always show at least this many total slots, and at least this many empty
 * ones — the tree should never look "full" or discourage more invites. */
const MIN_TOTAL_SLOTS = 6;
const MIN_EMPTY_SLOTS = 2;

interface TreeVisualProps {
  rootName: string;
  rootAvatarUrl?: string;
  rootRole: "player" | "agent" | "admin";
  children: NetworkNode[];
  referralCode: string;
}

/** Root-plus-direct-referrals org chart, with dashed "invite" slots for open spots. */
export function TreeVisual({ rootName, rootAvatarUrl, rootRole, children, referralCode }: TreeVisualProps) {
  const emptyCount = Math.max(MIN_EMPTY_SLOTS, MIN_TOTAL_SLOTS - children.length);
  const inviteHref = buildWhatsAppInviteLink(referralCode);

  return (
    <div className="flex flex-col items-center">
      {/* Root — you */}
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-gold-500/[0.12] to-transparent px-5 py-3 gold-ring">
        <Avatar name={rootName} src={rootAvatarUrl} size={56} ring />
        <div className="text-center">
          <p className="max-w-[10rem] truncate text-sm font-semibold text-ink-100">{rootName}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gold-300">
            You{rootRole === "agent" ? " · Agent" : rootRole === "admin" ? " · Admin" : ""}
          </p>
        </div>
      </div>

      <div className="h-6 w-px bg-white/15" />

      {/* Direct referrals + open invite slots */}
      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {children.map((node) => (
          <TreeCard key={node.user.id} node={node} />
        ))}
        {Array.from({ length: emptyCount }, (_, i) => (
          <InviteSlot key={`empty-${i}`} href={inviteHref} />
        ))}
      </div>
    </div>
  );
}

function TreeCard({ node }: { node: NetworkNode }) {
  const isAgent = node.user.role === "agent";
  const inputs = {
    kycVerified: node.user.kycStatus === "verified",
    tableHours: node.user.stats.tableHours,
    directReferrals: node.children.length,
  };

  return (
    <div className="flex flex-col items-center">
      <div className="h-4 w-px bg-white/15" />
      <div className="card-surface flex w-full flex-col items-center gap-1.5 p-3 text-center">
        <Avatar name={node.user.fullName} src={node.user.avatarUrl} size={40} ring={isAgent} />
        <p className="w-full truncate text-xs font-medium text-ink-100">{node.user.fullName}</p>
        {isAgent ? (
          <Badge tone="gold">Agent</Badge>
        ) : (
          <MemberStatusBadge status={memberStatus(inputs)} level={currentLevel(inputs).level} />
        )}
      </div>
    </div>
  );
}

function InviteSlot({ href }: { href: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-4 w-px bg-white/10" />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-emerald-glow/25 bg-emerald-glow/[0.03] p-3 text-center transition hover:border-emerald-glow/50 hover:bg-emerald-glow/[0.07]"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-glow/10 text-emerald-soft">
          <UserPlus size={18} />
        </span>
        <p className="text-xs font-medium text-emerald-soft">Invite</p>
      </a>
    </div>
  );
}
