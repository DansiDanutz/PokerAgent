import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { scoreFive, HandCategory } from "./handRank";

const cat = (s: string) => scoreFive(parseCards(s)).category;
const score = (s: string) => scoreFive(parseCards(s)).score;

describe("scoreFive — categories", () => {
  it("detects a royal/straight flush", () => {
    expect(cat("As Ks Qs Js Ts")).toBe(HandCategory.StraightFlush);
  });
  it("detects the wheel straight flush (A-2-3-4-5)", () => {
    expect(cat("As 2s 3s 4s 5s")).toBe(HandCategory.StraightFlush);
  });
  it("detects four of a kind", () => {
    expect(cat("9c 9d 9h 9s 2c")).toBe(HandCategory.FourOfAKind);
  });
  it("detects a full house", () => {
    expect(cat("Kc Kd Kh 4s 4c")).toBe(HandCategory.FullHouse);
  });
  it("detects a flush", () => {
    expect(cat("Ah Th 7h 4h 2h")).toBe(HandCategory.Flush);
  });
  it("detects a straight", () => {
    expect(cat("9c 8d 7h 6s 5c")).toBe(HandCategory.Straight);
  });
  it("detects the wheel straight", () => {
    expect(cat("Ac 2d 3h 4s 5c")).toBe(HandCategory.Straight);
  });
  it("detects three of a kind", () => {
    expect(cat("Qc Qd Qh 9s 2c")).toBe(HandCategory.ThreeOfAKind);
  });
  it("detects two pair", () => {
    expect(cat("Jc Jd 4h 4s 9c")).toBe(HandCategory.TwoPair);
  });
  it("detects one pair", () => {
    expect(cat("Tc Td 8h 5s 2c")).toBe(HandCategory.Pair);
  });
  it("detects high card", () => {
    expect(cat("Ac Jd 8h 5s 2c")).toBe(HandCategory.HighCard);
  });
});

describe("scoreFive — ordering", () => {
  it("ranks categories in the correct order", () => {
    expect(score("As Ks Qs Js Ts")).toBeGreaterThan(score("9c 9d 9h 9s 2c"));
    expect(score("9c 9d 9h 9s 2c")).toBeGreaterThan(score("Kc Kd Kh 4s 4c"));
    expect(score("Kc Kd Kh 4s 4c")).toBeGreaterThan(score("Ah Th 7h 4h 2h"));
    expect(score("Ah Th 7h 4h 2h")).toBeGreaterThan(score("9c 8d 7h 6s 5c"));
    expect(score("9c 8d 7h 6s 5c")).toBeGreaterThan(score("Qc Qd Qh 9s 2c"));
    expect(score("Qc Qd Qh 9s 2c")).toBeGreaterThan(score("Jc Jd 4h 4s 9c"));
    expect(score("Jc Jd 4h 4s 9c")).toBeGreaterThan(score("Tc Td 8h 5s 2c"));
    expect(score("Tc Td 8h 5s 2c")).toBeGreaterThan(score("Ac Jd 8h 5s 2c"));
  });

  it("breaks ties by kicker", () => {
    // Pair of aces, king kicker beats pair of aces, queen kicker.
    expect(score("Ac Ad Kh 5s 2c")).toBeGreaterThan(score("Ac Ad Qh 5s 2c"));
  });

  it("ranks the wheel below a six-high straight", () => {
    expect(score("6c 5d 4h 3s 2c")).toBeGreaterThan(score("Ac 2d 3h 4s 5c"));
  });

  it("treats identical hands as equal score", () => {
    expect(score("Ac Ad Kh 5s 2c")).toBe(score("As Ah Kd 5c 2d"));
  });
});
