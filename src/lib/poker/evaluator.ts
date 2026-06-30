/**
 * Best-hand evaluation for Texas Hold'em and Omaha.
 *
 * Hold'em: best 5 of (2 hole + up to 5 board) cards.
 * Omaha:   best 5 using EXACTLY 2 hole cards + EXACTLY 3 board cards.
 */

import type { Card } from "./cards";
import { scoreFive, type HandValue } from "./handRank";

export type GameType = "holdem" | "omaha";

/** Generate all k-combinations of an array (indices preserved, order stable). */
export function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = items.length;
  if (k > n || k < 0) return result;
  const combo: T[] = new Array(k);
  const recurse = (start: number, depth: number): void => {
    if (depth === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= n - (k - depth); i++) {
      combo[depth] = items[i];
      recurse(i + 1, depth + 1);
    }
  };
  recurse(0, 0);
  return result;
}

function bestOf(cards: Card[][]): HandValue {
  let best: HandValue | null = null;
  for (const five of cards) {
    const value = scoreFive(five);
    if (!best || value.score > best.score) best = value;
  }
  if (!best) throw new Error("No five-card hand could be formed");
  return best;
}

/**
 * Evaluate the best 5-card hand from 2 hole + 3-5 board cards.
 * Requires at least 5 total cards (i.e. board has 3+ on the flop).
 */
export function evaluateHoldem(hole: Card[], board: Card[]): HandValue {
  const all = [...hole, ...board];
  if (all.length < 5) {
    throw new Error(`Hold'em needs at least 5 cards, got ${all.length}`);
  }
  return bestOf(combinations(all, 5));
}

/**
 * Evaluate Omaha: exactly 2 of 4 hole cards + exactly 3 of the board.
 * Requires 4 hole cards and at least 3 board cards.
 */
export function evaluateOmaha(hole: Card[], board: Card[]): HandValue {
  if (hole.length !== 4) {
    throw new Error(`Omaha requires exactly 4 hole cards, got ${hole.length}`);
  }
  if (board.length < 3) {
    throw new Error(`Omaha needs at least 3 board cards, got ${board.length}`);
  }
  const holeCombos = combinations(hole, 2);
  const boardCombos = combinations(board, 3);
  const fives: Card[][] = [];
  for (const h of holeCombos) {
    for (const b of boardCombos) {
      fives.push([...h, ...b]);
    }
  }
  return bestOf(fives);
}

export function evaluateHand(game: GameType, hole: Card[], board: Card[]): HandValue {
  return game === "omaha" ? evaluateOmaha(hole, board) : evaluateHoldem(hole, board);
}

export const HOLE_COUNT: Record<GameType, number> = { holdem: 2, omaha: 4 };
