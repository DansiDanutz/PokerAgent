"use client";

import { clsx } from "clsx";
import type { Card, Suit } from "@/lib/poker";

const SUIT_SYMBOL: Record<Suit, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };
const RANK_CHAR: Record<number, string> = {
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

function rankLabel(rank: number): string {
  return RANK_CHAR[rank] ?? String(rank);
}

const isRed = (s: Suit) => s === "h" || s === "d";

export function PlayingCard({
  card,
  size = "md",
  onClick,
  selected,
  dimmed,
}: {
  card: Card;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
}) {
  const dims =
    size === "lg"
      ? "h-20 w-14 text-2xl"
      : size === "sm"
        ? "h-9 w-7 text-sm"
        : "h-14 w-10 text-lg";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        "relative flex flex-col items-center justify-center rounded-lg bg-ink-100 font-semibold leading-none shadow-md transition",
        dims,
        isRed(card.suit) ? "text-[#d23] " : "text-[#0b0b0b]",
        selected && "ring-2 ring-emerald-glow",
        dimmed && "opacity-25",
        onClick && "hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <span>{rankLabel(card.rank)}</span>
      <span className="text-[0.85em]">{SUIT_SYMBOL[card.suit]}</span>
    </Comp>
  );
}

export function EmptySlot({
  active,
  onClick,
  size = "md",
}: {
  active?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "h-20 w-14" : size === "sm" ? "h-9 w-7" : "h-14 w-10";
  return (
    <button
      onClick={onClick}
      className={clsx(
        "grid place-items-center rounded-lg border-2 border-dashed text-ink-500 transition",
        dims,
        active
          ? "border-emerald-glow bg-emerald-glow/10 text-emerald-soft"
          : "border-white/15 hover:border-white/30",
      )}
      aria-label="Empty card slot"
    >
      +
    </button>
  );
}
