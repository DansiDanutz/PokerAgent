/**
 * Five-card hand scoring.
 *
 * Each 5-card hand is reduced to a single integer `score` so hands compare
 * with plain `>`/`<`. The score packs the category and up to five tiebreak
 * ranks into base-16 digits (ranks are 2..14, always < 16).
 */

import type { Card, Rank } from "./cards";

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.Pair]: "Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.ThreeOfAKind]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.FourOfAKind]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
};

export interface HandValue {
  readonly score: number;
  readonly category: HandCategory;
  /** Ranks ordered by tiebreak importance (most significant first). */
  readonly tiebreak: Rank[];
}

function packScore(category: HandCategory, tiebreak: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 16 + (tiebreak[i] ?? 0);
  }
  return score;
}

/**
 * Detect the high card of the best straight contained in a set of distinct,
 * descending ranks. Returns 0 when there is no straight. Handles the wheel
 * (A-2-3-4-5) where the Ace plays low and the straight's high card is 5.
 */
function straightHigh(descRanks: number[]): number {
  const present = new Set(descRanks);
  // Ace also plays as 1 for the wheel.
  const ranks = present.has(14) ? new Set([...present, 1]) : present;
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let r = high; r > high - 5; r--) {
      if (!ranks.has(r)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return 0;
}

/** Score exactly five cards. Throws if not given five. */
export function scoreFive(cards: Card[]): HandValue {
  if (cards.length !== 5) {
    throw new Error(`scoreFive requires exactly 5 cards, got ${cards.length}`);
  }

  // Rank frequency map.
  const countByRank = new Map<number, number>();
  for (const c of cards) {
    countByRank.set(c.rank, (countByRank.get(c.rank) ?? 0) + 1);
  }

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const distinctDesc = [...countByRank.keys()].sort((a, b) => b - a);
  const straightTop = distinctDesc.length >= 5 ? straightHigh(distinctDesc) : 0;

  // Rank groups sorted by (count desc, rank desc) — drives pair/trips/quads tiebreaks.
  const groups = [...countByRank.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const counts = groups.map((g) => g[1]);
  const byCount = (n: number) => groups.filter((g) => g[1] === n).map((g) => g[0]);

  if (straightTop && isFlush) {
    return { score: packScore(HandCategory.StraightFlush, [straightTop]), category: HandCategory.StraightFlush, tiebreak: [straightTop as Rank] };
  }
  if (counts[0] === 4) {
    const quad = byCount(4)[0];
    const kicker = groups.find((g) => g[1] === 1)![0];
    return { score: packScore(HandCategory.FourOfAKind, [quad, kicker]), category: HandCategory.FourOfAKind, tiebreak: [quad, kicker] as Rank[] };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    const trip = byCount(3)[0];
    const pair = byCount(2)[0];
    return { score: packScore(HandCategory.FullHouse, [trip, pair]), category: HandCategory.FullHouse, tiebreak: [trip, pair] as Rank[] };
  }
  if (isFlush) {
    const tb = distinctDesc.slice(0, 5);
    return { score: packScore(HandCategory.Flush, tb), category: HandCategory.Flush, tiebreak: tb as Rank[] };
  }
  if (straightTop) {
    return { score: packScore(HandCategory.Straight, [straightTop]), category: HandCategory.Straight, tiebreak: [straightTop as Rank] };
  }
  if (counts[0] === 3) {
    const trip = byCount(3)[0];
    const kickers = byCount(1).sort((a, b) => b - a).slice(0, 2);
    const tb = [trip, ...kickers];
    return { score: packScore(HandCategory.ThreeOfAKind, tb), category: HandCategory.ThreeOfAKind, tiebreak: tb as Rank[] };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = byCount(2).sort((a, b) => b - a);
    const kicker = byCount(1)[0];
    const tb = [pairs[0], pairs[1], kicker];
    return { score: packScore(HandCategory.TwoPair, tb), category: HandCategory.TwoPair, tiebreak: tb as Rank[] };
  }
  if (counts[0] === 2) {
    const pair = byCount(2)[0];
    const kickers = byCount(1).sort((a, b) => b - a).slice(0, 3);
    const tb = [pair, ...kickers];
    return { score: packScore(HandCategory.Pair, tb), category: HandCategory.Pair, tiebreak: tb as Rank[] };
  }
  const tb = distinctDesc.slice(0, 5);
  return { score: packScore(HandCategory.HighCard, tb), category: HandCategory.HighCard, tiebreak: tb as Rank[] };
}
