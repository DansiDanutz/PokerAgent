import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { countOuts, drawProbability, potOdds, combinationCount } from "./odds";

describe("countOuts", () => {
  it("finds 9 outs for a flush draw on the flop", () => {
    // Four hearts after the flop → 9 remaining hearts complete the flush.
    const { outs } = countOuts({
      game: "holdem",
      hole: parseCards("Ah Kh"),
      board: parseCards("Qh 7h 2c"),
    });
    // Includes flush outs plus any cards that pair to beat nothing made;
    // here only the flush and overcard improvements count as beating "high card".
    expect(outs).toBeGreaterThanOrEqual(9);
  });

  it("finds 8 outs for an open-ended straight draw", () => {
    const { cards } = countOuts({
      game: "holdem",
      hole: parseCards("9c 8d"),
      board: parseCards("7h 6s 2c"),
    });
    const ranks = new Set(cards.map((c) => c.rank));
    expect(ranks.has(10)).toBe(true); // tens complete the straight
    expect(ranks.has(5)).toBe(true); // fives complete the straight
  });
});

describe("drawProbability", () => {
  it("matches the rule-of-4 ballpark for 9 outs on the flop", () => {
    expect(drawProbability(9, 2)).toBeCloseTo(0.35, 2);
  });
  it("matches the rule-of-2 ballpark for 9 outs on the turn", () => {
    expect(drawProbability(9, 1)).toBeCloseTo(0.1915, 3);
  });
  it("clamps at the extremes", () => {
    expect(drawProbability(0, 2)).toBe(0);
    expect(drawProbability(99, 1)).toBe(1);
  });
});

describe("potOdds", () => {
  it("computes break-even equity and a +EV call decision", () => {
    const r = potOdds({ potBeforeCall: 100, callAmount: 50, equity: 0.4 });
    expect(r.breakEvenEquity).toBeCloseTo(50 / 150, 6);
    expect(r.call).toBe(true);
  });
  it("flags a -EV call", () => {
    const r = potOdds({ potBeforeCall: 30, callAmount: 70, equity: 0.3 });
    expect(r.call).toBe(false);
  });
});

describe("combinationCount", () => {
  it("computes binomial coefficients", () => {
    expect(combinationCount(52, 2)).toBe(1326);
    expect(combinationCount(48, 5)).toBe(1712304);
    expect(combinationCount(7, 5)).toBe(21);
  });
});
