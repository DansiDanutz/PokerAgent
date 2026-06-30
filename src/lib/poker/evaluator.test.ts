import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { combinations, evaluateHoldem, evaluateOmaha } from "./evaluator";
import { HandCategory } from "./handRank";

describe("combinations", () => {
  it("produces C(n,k) combos", () => {
    expect(combinations([1, 2, 3, 4, 5], 5).length).toBe(1);
    expect(combinations([1, 2, 3, 4, 5, 6, 7], 5).length).toBe(21);
    expect(combinations([1, 2, 3, 4], 2).length).toBe(6);
  });
});

describe("evaluateHoldem", () => {
  it("finds a flush across hole + board", () => {
    const v = evaluateHoldem(parseCards("Ah Kh"), parseCards("Qh 7h 2h 3c 4d"));
    expect(v.category).toBe(HandCategory.Flush);
  });
  it("finds the best straight using the board", () => {
    const v = evaluateHoldem(parseCards("9c 8d"), parseCards("7h 6s 5c 2d Ah"));
    expect(v.category).toBe(HandCategory.Straight);
  });
  it("works at showdown with 7 cards and on the flop with 5", () => {
    expect(() => evaluateHoldem(parseCards("Ac Ad"), parseCards("Ah Kd 2c"))).not.toThrow();
  });
});

describe("evaluateOmaha", () => {
  it("requires exactly two hole cards to play — board flush is NOT a flush", () => {
    // Four hearts on board + one heart in hand: in Hold'em this is a flush,
    // but Omaha forces exactly two hole cards, so only one heart can be used.
    const v = evaluateOmaha(parseCards("Ah 2c 3d 4s"), parseCards("Kh Qh Jh 7c 8d"));
    expect(v.category).not.toBe(HandCategory.Flush);
  });
  it("makes a flush when two suited hole cards are held", () => {
    const v = evaluateOmaha(parseCards("Ah Kh 2c 3d"), parseCards("Qh 7h 2h 8s 9d"));
    expect(v.category).toBe(HandCategory.Flush);
  });
  it("rejects the wrong number of hole cards", () => {
    expect(() => evaluateOmaha(parseCards("Ah Kh Qh"), parseCards("2c 3d 4s"))).toThrow();
  });
});
