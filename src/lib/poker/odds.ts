/**
 * Pot-odds and drawing helpers — the practical numbers a player needs at the
 * table, derived from the equity engine and simple combinatorics.
 */

import { type Card, deckWithout } from "./cards";
import { combinations, evaluateHand, type GameType } from "./evaluator";

/**
 * Count the number of remaining cards that improve `hole` to beat the current
 * best made hand on the board (i.e. genuine "outs"). Computed exactly by
 * testing every unseen card on the next street.
 *
 * Returns outs plus the implied one-card hit percentage.
 */
export function countOuts(params: {
  game: GameType;
  hole: Card[];
  board: Card[];
  dead?: Card[];
}): { outs: number; cards: Card[]; hitPct: number } {
  const { game, hole, board, dead = [] } = params;
  if (board.length < 3 || board.length >= 5) {
    throw new Error("Outs are computed on the flop or turn (3 or 4 board cards)");
  }
  const known = [...hole, ...board, ...dead];
  const current = evaluateHand(game, hole, board).score;
  const unseen = deckWithout(known);
  const cards: Card[] = [];
  for (const c of unseen) {
    const improved = evaluateHand(game, hole, [...board, c]).score;
    if (improved > current) cards.push(c);
  }
  return { outs: cards.length, cards, hitPct: cards.length / unseen.length };
}

/**
 * Probability of completing a draw with a given number of outs by the river.
 * Uses exact combinatorics over the unseen cards.
 *
 * `streetsToCome` is 2 on the flop, 1 on the turn.
 */
export function drawProbability(
  outs: number,
  streetsToCome: 1 | 2,
  unseenCount = 47,
): number {
  if (outs <= 0) return 0;
  if (outs >= unseenCount) return 1;
  if (streetsToCome === 1) return outs / unseenCount;
  // P(hit) = 1 - P(miss both streets).
  const missTurn = (unseenCount - outs) / unseenCount;
  const missRiver = (unseenCount - 1 - outs) / (unseenCount - 1);
  return 1 - missTurn * missRiver;
}

/**
 * Pot odds: the share of the final pot you must contribute to call.
 * Returns the break-even equity and whether a call is +EV given your equity.
 */
export function potOdds(params: {
  potBeforeCall: number;
  callAmount: number;
  /** Your estimated equity (0..1). Optional — omit to just get break-even. */
  equity?: number;
}): { breakEvenEquity: number; ratio: string; call: boolean | null } {
  const { potBeforeCall, callAmount, equity } = params;
  if (callAmount < 0 || potBeforeCall < 0) {
    throw new Error("Pot and call amounts must be non-negative");
  }
  const finalPot = potBeforeCall + callAmount;
  const breakEvenEquity = finalPot === 0 ? 0 : callAmount / finalPot;
  const ratio =
    callAmount === 0 ? "∞ : 1" : `${(potBeforeCall / callAmount).toFixed(2)} : 1`;
  const call = equity === undefined ? null : equity >= breakEvenEquity;
  return { breakEvenEquity, ratio, call };
}

/** Convenience: enumerate combinations count without materializing them. */
export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

export { combinations };
