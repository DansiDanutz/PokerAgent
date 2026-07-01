"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { LevelsGuide, LEVELS_GUIDE_TITLE } from "@/components/dashboard/LevelsGuide";

/**
 * Small "i" trigger (in the "Path to Agent" card header) that opens the shared
 * levels / agent-status / rakeback guide.
 */
export function PathToAgentInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How levels, agent status, and rakeback work"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-500 ring-1 ring-inset ring-white/15 transition hover:bg-white/10 hover:text-ink-200"
      >
        <Info size={12} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={LEVELS_GUIDE_TITLE}>
        <LevelsGuide />
      </Modal>
    </>
  );
}
