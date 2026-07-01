"use client";

import { useState } from "react";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { Modal } from "@/components/ui/Modal";
import { LevelsGuide, LEVELS_GUIDE_TITLE } from "@/components/dashboard/LevelsGuide";
import type { MemberStatus } from "@/types/domain";

/**
 * The signed-in player's own level badge, made interactive: tapping it opens
 * the levels / agent-status / rakeback guide. The plain MemberStatusBadge is
 * left non-interactive for the read-only contexts (network tree, member lists)
 * where it labels *other* people.
 */
export function LevelBadge({ status, level }: { status: MemberStatus; level?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View level, agent status, and rakeback details"
        className="rounded-full transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
      >
        <MemberStatusBadge status={status} level={level} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={LEVELS_GUIDE_TITLE}>
        <LevelsGuide />
      </Modal>
    </>
  );
}
