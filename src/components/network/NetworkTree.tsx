"use client";

import { useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { clsx } from "clsx";
import type { NetworkNode } from "@/types/domain";
import { Avatar, Badge } from "@/components/ui";
import { formatMoney, formatNumber } from "@/lib/format";

export function NetworkTree({ root }: { root: NetworkNode }) {
  return (
    <ul className="space-y-2">
      {root.children.map((child) => (
        <TreeNode key={child.user.id} node={child} depth={0} />
      ))}
      {root.children.length === 0 && (
        <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-400">
          No referrals yet — share your invite code to grow your network.
        </li>
      )}
    </ul>
  );
}

function TreeNode({ node, depth }: { node: NetworkNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isAgent = node.user.role === "agent";

  return (
    <li>
      <div
        className="card-surface flex items-center gap-3 p-3"
        style={{ marginLeft: depth * 16 }}
      >
        <button
          onClick={() => hasChildren && setOpen((o) => !o)}
          className={clsx(
            "grid h-6 w-6 shrink-0 place-items-center rounded-md",
            hasChildren ? "text-ink-300 hover:bg-white/10" : "text-transparent",
          )}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight size={16} className={clsx("transition", open && "rotate-90")} />
        </button>
        <Avatar name={node.user.fullName} src={node.user.avatarUrl} size={36} ring={isAgent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-ink-100">{node.user.fullName}</p>
            {isAgent && <Badge tone="gold">agent</Badge>}
          </div>
          <p className="text-xs text-ink-500">
            @{node.user.username} · {formatNumber(node.user.stats.handsPlayed)} hands
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold gold-text">
            {formatMoney(node.user.stats.rakeGenerated, node.user.currency)}
          </p>
          <p className="text-[11px] text-ink-500">rake</p>
        </div>
        {hasChildren && (
          <span className="ml-2 hidden items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-ink-300 sm:flex">
            <Users size={11} /> {node.subtreeSize}
          </span>
        )}
      </div>
      {open && hasChildren && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeNode key={child.user.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
