"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Share2,
  Send,
  Twitter,
  Facebook,
  Mail,
  QrCode,
  Download,
  Link as LinkIcon,
} from "lucide-react";
import { Card, SectionTitle, Button } from "@/components/ui";

export interface PromoteHubProps {
  referralCode: string;
  referralLink: string;
  clubId: string;
  clubName: string;
}

interface Template {
  id: string;
  label: string;
  text: string;
}

export function PromoteHub({ referralCode, referralLink, clubId, clubName }: PromoteHubProps) {
  const templates: Template[] = [
    {
      id: "rakeback",
      label: "Rakeback hook",
      text: `🃏 Join me on ${clubName} (ClubGG club ${clubId}) and earn rakeback on every hand. Sign up with my code ${referralCode}: ${referralLink}`,
    },
    {
      id: "casual",
      label: "Casual invite",
      text: `Hey! I play on ${clubName} — solid games, fast payouts. Use my invite code ${referralCode} to join: ${referralLink}`,
    },
    {
      id: "competitive",
      label: "Competitive",
      text: `Think you can beat me at the tables? Join ${clubName} (ClubGG ${clubId}) with code ${referralCode} and let's run it: ${referralLink}`,
    },
  ];

  const [template, setTemplate] = useState<Template>(templates[0]);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const msg = encodeURIComponent(template.text);
  const link = encodeURIComponent(referralLink);
  const channels = [
    { label: "WhatsApp", icon: Share2, href: `https://wa.me/?text=${msg}`, tone: "emerald" as const },
    { label: "Telegram", icon: Send, href: `https://t.me/share/url?url=${link}&text=${msg}`, tone: "emerald" as const },
    { label: "X", icon: Twitter, href: `https://twitter.com/intent/tweet?text=${msg}`, tone: "neutral" as const },
    { label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${link}`, tone: "neutral" as const },
    { label: "Email", icon: Mail, href: `mailto:?subject=${encodeURIComponent(`Join ${clubName}`)}&body=${msg}`, tone: "neutral" as const },
  ];

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=0e1813&color=e9c46a&data=${link}`;

  const downloadBanner = () => {
    const svg = bannerSvg({ clubName, clubId, referralCode });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clubName.replace(/\s+/g, "-").toLowerCase()}-invite-banner.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Link + code */}
      <Card glow="emerald">
        <SectionTitle title="Your referral link" subtitle="Anyone who joins with this becomes a member of your tree" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-felt-900 px-3.5 py-2.5 ring-1 ring-inset ring-white/10">
            <LinkIcon size={16} className="text-ink-500" />
            <span className="truncate text-sm text-ink-200">{referralLink}</span>
          </div>
          <Button onClick={() => copy("link", referralLink)} className="shrink-0">
            {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3.5 py-2.5 ring-1 ring-inset ring-white/5">
          <span className="text-sm text-ink-400">Invite code</span>
          <button
            onClick={() => copy("code", referralCode)}
            className="flex items-center gap-2 text-lg font-semibold tracking-wider gold-text"
          >
            {referralCode}
            {copied === "code" ? <Check size={16} className="text-emerald-soft" /> : <Copy size={16} className="text-ink-400" />}
          </button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Message + channels */}
        <Card>
          <SectionTitle title="Share a message" subtitle="Pick a style, then post it anywhere" />
          <div className="mb-3 flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  template.id === t.id
                    ? "bg-emerald-glow/15 text-emerald-soft ring-emerald-glow/30"
                    : "bg-white/5 text-ink-300 ring-white/10 hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-felt-900 p-3.5 text-sm text-ink-200 ring-1 ring-inset ring-white/10">
            {template.text}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => copy("msg", template.text)}>
              {copied === "msg" ? <Check size={15} /> : <Copy size={15} />}
              {copied === "msg" ? "Copied" : "Copy text"}
            </Button>
            {channels.map((c) => {
              const Icon = c.icon;
              return (
                <a
                  key={c.label}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 ring-inset transition ${
                    c.tone === "emerald"
                      ? "btn-primary ring-0"
                      : "bg-white/5 text-ink-100 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  <Icon size={15} />
                  {c.label}
                </a>
              );
            })}
          </div>
        </Card>

        {/* QR + banner assets */}
        <Card>
          <SectionTitle title="Assets" subtitle="QR code & a ready-made invite banner" />
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-2xl bg-felt-900 p-3 gold-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR code for ${referralCode}`} width={150} height={150} className="rounded-lg" />
              <p className="mt-2 text-center text-[11px] text-ink-500">Scan to join</p>
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-ink-400">
                Download a branded banner for stories, posts or your bio. Includes your code and the club ID.
              </p>
              <Button variant="gold" onClick={downloadBanner}>
                <Download size={15} />
                Download banner
              </Button>
              <a
                href={qr.replace("200x200", "600x600")}
                download={`${referralCode}-qr.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-ink-100 ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                <QrCode size={15} />
                Download QR
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** A self-contained branded invite banner (1200×630, social-share size). */
function bannerSvg({ clubName, clubId, referralCode }: { clubName: string; clubId: string; referralCode: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a110d"/><stop offset="1" stop-color="#060a08"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f3d89b"/><stop offset="1" stop-color="#d4af37"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="120" r="320" fill="#19c37d" opacity="0.07"/>
  <text x="80" y="150" fill="url(#gold)" font-family="Inter,Arial,sans-serif" font-size="40" font-weight="700" letter-spacing="8">POKER AGENT</text>
  <text x="80" y="270" fill="#f4f7f5" font-family="Inter,Arial,sans-serif" font-size="84" font-weight="800">Join ${escapeXml(clubName)}</text>
  <text x="80" y="340" fill="#97a79e" font-family="Inter,Arial,sans-serif" font-size="34">Rakeback on every hand · ClubGG club ${escapeXml(clubId)}</text>
  <rect x="80" y="400" width="560" height="120" rx="20" fill="#11201a" stroke="#d4af37" stroke-opacity="0.5"/>
  <text x="110" y="448" fill="#6e7f76" font-family="Inter,Arial,sans-serif" font-size="24">INVITE CODE</text>
  <text x="110" y="500" fill="url(#gold)" font-family="Inter,Arial,sans-serif" font-size="52" font-weight="800" letter-spacing="4">${escapeXml(referralCode)}</text>
  <text x="80" y="585" fill="#19c37d" font-family="Inter,Arial,sans-serif" font-size="26" letter-spacing="6">♠ PLAY SMART. STAY AHEAD. ♠</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
  );
}
