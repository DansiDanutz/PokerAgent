/**
 * Card primitives for the poker engine.
 *
 * A card is represented as an immutable object plus a fast integer id (0-51)
 * so the hot paths in the evaluator and equity sampler can work with numbers.
 */

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number]; // 11=J, 12=Q, 13=K, 14=A

export const SUITS = ["c", "d", "h", "s"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
  /** Stable id 0-51 = (rank-2) * 4 + suitIndex. */
  readonly id: number;
}

const RANK_TO_CHAR: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const CHAR_TO_RANK: Record<string, Rank> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const suitIndex = (suit: Suit): number => SUITS.indexOf(suit);

export function makeCard(rank: Rank, suit: Suit): Card {
  return Object.freeze({ rank, suit, id: (rank - 2) * 4 + suitIndex(suit) });
}

/**
 * Parse a card string like "As", "Td", "7h", "Kc" (rank char + suit char).
 * Throws on malformed input — never trust external data.
 */
export function parseCard(input: string): Card {
  const text = input.trim();
  if (text.length < 2 || text.length > 3) {
    throw new Error(`Invalid card: "${input}"`);
  }
  const rankChar = text.slice(0, text.length - 1).toUpperCase();
  const suitChar = text.slice(-1).toLowerCase() as Suit;
  const rank = CHAR_TO_RANK[rankChar];
  if (rank === undefined) throw new Error(`Invalid rank in card: "${input}"`);
  if (!SUITS.includes(suitChar)) throw new Error(`Invalid suit in card: "${input}"`);
  return makeCard(rank, suitChar);
}

/** Parse a space- or comma-separated list of cards: "As Kd" or "As,Kd". */
export function parseCards(input: string): Card[] {
  return input
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map(parseCard);
}

export function cardToString(card: Card): string {
  return `${RANK_TO_CHAR[card.rank]}${card.suit}`;
}

export function cardFromId(id: number): Card {
  if (id < 0 || id > 51 || !Number.isInteger(id)) {
    throw new Error(`Invalid card id: ${id}`);
  }
  const rank = ((id >> 2) + 2) as Rank;
  const suit = SUITS[id & 3];
  return makeCard(rank, suit);
}

/** A fresh, ordered 52-card deck. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

/** The deck minus a set of excluded cards (by id). */
export function deckWithout(excluded: Iterable<Card>): Card[] {
  const dead = new Set<number>();
  for (const c of excluded) dead.add(c.id);
  return fullDeck().filter((c) => !dead.has(c.id));
}

export const RANK_NAMES: Record<Rank, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};
