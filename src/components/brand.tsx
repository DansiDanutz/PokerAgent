"use client";

import { useId } from "react";
import Link from "next/link";
import { clsx } from "clsx";

/** The spade emblem + wordmark used across auth and the app shell. */
export function Brand({ size = "md", href }: { size?: "sm" | "md" | "lg"; href?: string }) {
  const dim = size === "lg" ? 44 : size === "sm" ? 26 : 34;
  const content = (
    <div className="flex items-center gap-3">
      <SpadeMark size={dim} />
      <div className="leading-none">
        <p
          className={clsx(
            "font-semibold tracking-[0.18em] gold-text",
            size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg",
          )}
        >
          POKER AGENT
        </p>
        {size !== "sm" && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-ink-500">
            AI-Powered Poker Assistant
          </p>
        )}
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      aria-label="Go to dashboard"
      className="rounded-lg transition hover:opacity-85 focus-visible:opacity-85"
    >
      {content}
    </Link>
  );
}

export function SpadeMark({ size = 34 }: { size?: number }) {
  const gradientId = useId();
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-felt-700 to-felt-950 gold-ring"
      style={{ width: size, height: size }}
    >
      {/* Subtle top sheen for a lifted, medallion-like feel rather than a flat icon. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        aria-hidden
        fill={`url(#${gradientId})`}
        className="relative"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f8e3b0" />
            <stop offset="0.5" stopColor="#e9c46a" />
            <stop offset="1" stopColor="#b9860a" />
          </linearGradient>
        </defs>
        <path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 6.5 3.1c-.2 1.7-.9 2.9-1.9 3.9h6.8c-1-.99-1.7-2.2-1.9-3.9A4 4 0 0 0 20 13c0-4.5-5-7-8-11Z" />
      </svg>
    </div>
  );
}

export function Tagline() {
  return (
    <p className="text-center text-xs uppercase tracking-[0.4em] text-gold-500/70">
      ♠ Play Smart. Stay Ahead. ♠
    </p>
  );
}
