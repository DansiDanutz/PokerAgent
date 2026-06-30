/**
 * Equity calculation: given each player's hole cards (or "random") and the
 * current board, estimate each player's probability of winning the pot.
 *
 * Strategy:
 *  - If every player's hole cards are known, the only unknowns are the
 *    remaining board cards. When the number of board completions is small,
 *    enumerate them EXACTLY. Otherwise fall back to Monte Carlo.
 *  - If any player's hole cards are unknown, always use Monte Carlo (the
 *    search space is far too large to enumerate).
 */

import { type Card, deckWithout } from "./cards";
import { combinations, evaluateHand, HOLE_COUNT, type GameType } from "./evaluator";

export interface PlayerInput {
  /** Known hole cards, or null/undefined for a random (unknown) hand. */
  hole?: Card[] | null;
  label?: string;
}

export interface PlayerEquity {
  label: string;
  /** Probability of winning outright. */
  win: number;
  /** Probability of tying (chopping) the pot. */
  tie: number;
  /** Probability of losing. */
  lose: number;
  /** Pot equity assuming ties split the pot evenly (win + sum of tie shares). */
  equity: number;
}

export interface EquityResult {
  players: PlayerEquity[];
  iterations: number;
  exact: boolean;
}

export interface EquityOptions {
  game: GameType;
  players: PlayerInput[];
  board?: Card[];
  dead?: Card[];
  /** Monte Carlo trial count (ignored when an exact enumeration is run). */
  iterations?: number;
  /** Seed for reproducible Monte Carlo runs. Omit for true randomness. */
  seed?: number;
  /** Max board completions to enumerate exactly before using Monte Carlo. */
  exactThreshold?: number;
}

/** Deterministic PRNG (mulberry32) so Monte Carlo runs are reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates: draw `count` cards from a deck copy using `rng`. */
function drawRandom(deck: Card[], count: number, rng: () => number): Card[] {
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck.slice(0, count);
}

interface Tally {
  win: number;
  tie: number;
  equity: number;
}

/** Score one completed showdown and update tallies (mutates `tallies`). */
function settleShowdown(
  game: GameType,
  holes: Card[][],
  board: Card[],
  tallies: Tally[],
): void {
  let bestScore = -1;
  let winners: number[] = [];
  for (let p = 0; p < holes.length; p++) {
    const value = evaluateHand(game, holes[p], board);
    if (value.score > bestScore) {
      bestScore = value.score;
      winners = [p];
    } else if (value.score === bestScore) {
      winners.push(p);
    }
  }
  if (winners.length === 1) {
    tallies[winners[0]].win += 1;
    tallies[winners[0]].equity += 1;
  } else {
    const share = 1 / winners.length;
    for (const w of winners) {
      tallies[w].tie += 1;
      tallies[w].equity += share;
    }
  }
}

function validateInputs(opts: EquityOptions): {
  holeCount: number;
  board: Card[];
  dead: Card[];
} {
  const { game, players } = opts;
  if (players.length < 2) throw new Error("Equity needs at least 2 players");
  const holeCount = HOLE_COUNT[game];
  const board = opts.board ?? [];
  if (board.length > 5) throw new Error("A board cannot have more than 5 cards");
  for (const p of players) {
    if (p.hole && p.hole.length !== holeCount) {
      throw new Error(
        `${game} hands need ${holeCount} hole cards (got ${p.hole.length})`,
      );
    }
  }
  // No duplicate cards anywhere.
  const seen = new Set<number>();
  const all: Card[] = [...board, ...(opts.dead ?? [])];
  for (const p of players) if (p.hole) all.push(...p.hole);
  for (const c of all) {
    if (seen.has(c.id)) throw new Error("Duplicate card detected in inputs");
    seen.add(c.id);
  }
  return { holeCount, board, dead: opts.dead ?? [] };
}

export function calculateEquity(opts: EquityOptions): EquityResult {
  const { holeCount, board, dead } = validateInputs(opts);
  const { game, players } = opts;
  const labels = players.map((p, i) => p.label ?? `Player ${i + 1}`);
  const tallies: Tally[] = players.map(() => ({ win: 0, tie: 0, equity: 0 }));

  const known: Card[] = [...board, ...dead];
  for (const p of players) if (p.hole) known.push(...p.hole);

  const allKnown = players.every((p) => p.hole && p.hole.length === holeCount);
  const boardNeeded = 5 - board.length;
  const exactThreshold = opts.exactThreshold ?? 50_000;

  // ---- Exact enumeration over remaining board cards ----------------------
  if (allKnown) {
    const remaining = deckWithout(known);
    const boardCombos = combinations(remaining, boardNeeded);
    if (boardCombos.length <= exactThreshold) {
      const holes = players.map((p) => p.hole!);
      if (boardNeeded === 0) {
        settleShowdown(game, holes, board, tallies);
        return finalize(labels, tallies, 1, true);
      }
      for (const completion of boardCombos) {
        settleShowdown(game, holes, [...board, ...completion], tallies);
      }
      return finalize(labels, tallies, boardCombos.length, true);
    }
  }

  // ---- Monte Carlo -------------------------------------------------------
  const iterations = opts.iterations ?? 50_000;
  const rng = opts.seed === undefined ? Math.random : mulberry32(opts.seed);
  for (let it = 0; it < iterations; it++) {
    const deck = deckWithout(known);
    // Shuffle once, then deal sequentially from the front.
    drawRandom(deck, deck.length, rng);
    let cursor = 0;
    const holes = players.map((p) => {
      if (p.hole) return p.hole;
      const dealt = deck.slice(cursor, cursor + holeCount);
      cursor += holeCount;
      return dealt;
    });
    const completion = deck.slice(cursor, cursor + boardNeeded);
    settleShowdown(game, holes, [...board, ...completion], tallies);
  }
  return finalize(labels, tallies, iterations, false);
}

function finalize(
  labels: string[],
  tallies: Tally[],
  iterations: number,
  exact: boolean,
): EquityResult {
  const players: PlayerEquity[] = tallies.map((t, i) => ({
    label: labels[i],
    win: t.win / iterations,
    tie: t.tie / iterations,
    lose: (iterations - t.win - t.tie) / iterations,
    equity: t.equity / iterations,
  }));
  return { players, iterations, exact };
}
