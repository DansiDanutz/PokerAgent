"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Card } from "@/components/ui";
import { buildWhatsAppInviteLink } from "@/lib/whatsapp";

export function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const whatsapp = buildWhatsAppInviteLink(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <Card glow="emerald">
      <p className="text-xs uppercase tracking-wide text-ink-400">Your invite code</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-2xl font-semibold tracking-wider gold-text">{code}</span>
        <button
          onClick={copy}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-ink-200 ring-1 ring-inset ring-white/10 hover:bg-white/10"
          aria-label="Copy invite code"
        >
          {copied ? <Check size={18} className="text-emerald-soft" /> : <Copy size={18} />}
        </button>
      </div>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm"
      >
        <Share2 size={16} />
        Invite via WhatsApp
      </a>
    </Card>
  );
}
