"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Apple, Smartphone } from "lucide-react";
import { Card } from "@/components/ui";
import { SpadeMark } from "@/components/brand";

interface Props {
  clubId: string;
  clubName: string;
  unionName: string;
  inviteLink: string;
  iosAppUrl: string;
  androidAppUrl: string;
  configured: boolean;
}

export function JoinClubCard(props: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.clubId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card glow="gold">
      <div className="flex items-center gap-3">
        <SpadeMark size={36} />
        <div>
          <p className="text-sm font-semibold text-ink-100">{props.clubName}</p>
          <p className="text-xs text-ink-500">on ClubGG · {props.unionName}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-felt-900 p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-ink-400">Club ID</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="text-3xl font-semibold tracking-[0.2em] gold-text">{props.clubId}</span>
          <button
            onClick={copy}
            className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-ink-200 ring-1 ring-inset ring-white/10 hover:bg-white/10"
            aria-label="Copy Club ID"
          >
            {copied ? <Check size={16} className="text-emerald-soft" /> : <Copy size={16} />}
          </button>
        </div>
        {!props.configured && (
          <p className="mt-2 text-[11px] text-[var(--color-warning)]">
            Placeholder — set NEXT_PUBLIC_CLUBGG_CLUB_ID to your real Club ID.
          </p>
        )}
      </div>

      <a
        href={props.inviteLink}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm"
      >
        <ExternalLink size={16} />
        Open club in ClubGG
      </a>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <AppLink href={props.iosAppUrl} icon={<Apple size={14} />} label="iOS app" />
        <AppLink href={props.androidAppUrl} icon={<Smartphone size={14} />} label="Android app" />
      </div>

      <ol className="mt-4 space-y-1.5 text-xs text-ink-400">
        <li><Step n={1} /> Download ClubGG and create a free account.</li>
        <li><Step n={2} /> Go to <span className="text-ink-200">Clubs → Join Club</span> and enter <span className="font-mono text-gold-300">{props.clubId}</span>.</li>
        <li><Step n={3} /> Your agent approves you and loads your chips.</li>
      </ol>
    </Card>
  );
}

function AppLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs text-ink-200 ring-1 ring-inset ring-white/10 hover:bg-white/10"
    >
      {icon}
      {label}
    </a>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full bg-emerald-glow/20 text-[10px] font-semibold text-emerald-soft">
      {n}
    </span>
  );
}
