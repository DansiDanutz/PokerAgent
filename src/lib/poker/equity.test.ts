import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { calculateEquity } from "./equity";

describe("calculateEquity — exact (board fully known)", () => {
  it("awards the whole pot to the made winner at showdown", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [{ hole: parseCards("Ac Ad") }, { hole: parseCards("Kc Kd") }],
      board: parseCards("Ah 7c 2d 9s 3h"), // hero flopped a set of aces
    });
    expect(r.exact).toBe(true);
    expect(r.players[0].equity).toBe(1);
    expect(r.players[1].equity).toBe(0);
  });

  it("splits the pot when both players play the board", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [{ hole: parseCards("2c 3d") }, { hole: parseCards("2h 3s") }],
      board: parseCards("As Ks Qd Jh Th"), // broadway on board, plays for both
    });
    expect(r.players[0].equity).toBeCloseTo(0.5, 5);
    expect(r.players[1].equity).toBeCloseTo(0.5, 5);
  });

  it("enumerates the river exactly (one card to come)", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [{ hole: parseCards("Ah Kh") }, { hole: parseCards("Qc Qd") }],
      board: parseCards("Qh Jh Th 2c"), // hero has a made straight flush draw vs set
    });
    expect(r.exact).toBe(true);
    expect(r.iterations).toBe(44); // 52 - 4 holes - 4 board
  });
});

describe("calculateEquity — Monte Carlo benchmarks (seeded)", () => {
  it("AA vs KK preflop is roughly 82% / 18%", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [{ hole: parseCards("Ac Ad") }, { hole: parseCards("Kc Kd") }],
      iterations: 20000,
      seed: 12345,
    });
    expect(r.exact).toBe(false);
    expect(r.players[0].equity).toBeGreaterThan(0.78);
    expect(r.players[0].equity).toBeLessThan(0.86);
  });

  it("equities across all players sum to 1", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [
        { hole: parseCards("Ac Ad") },
        { hole: parseCards("Kc Kd") },
        { hole: parseCards("Qc Qd") },
      ],
      iterations: 5000,
      seed: 7,
    });
    const total = r.players.reduce((s, p) => s + p.equity, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("handles an unknown (random) opponent hand", () => {
    const r = calculateEquity({
      game: "holdem",
      players: [{ hole: parseCards("Ac Ad") }, { hole: null, label: "Random" }],
      iterations: 5000,
      seed: 99,
    });
    // AA vs a single random hand is ~85%.
    expect(r.players[0].equity).toBeGreaterThan(0.8);
  });

  it("computes Omaha equity (double-suited rundown vs aces)", () => {
    const r = calculateEquity({
      game: "omaha",
      players: [
        { hole: parseCards("Ac Ad Kc Kd") },
        { hole: parseCards("9h 8h 7s 6s") },
      ],
      iterations: 5000,
      seed: 42,
    });
    const total = r.players[0].equity + r.players[1].equity;
    expect(total).toBeCloseTo(1, 6);
    expect(r.players[0].equity).toBeGreaterThan(0.5); // aces still favored
  });
});

describe("calculateEquity — validation", () => {
  it("rejects duplicate cards", () => {
    expect(() =>
      calculateEquity({
        game: "holdem",
        players: [{ hole: parseCards("Ac Ad") }, { hole: parseCards("Ac Kd") }],
      }),
    ).toThrow(/duplicate/i);
  });
  it("rejects the wrong hole-card count for the game", () => {
    expect(() =>
      calculateEquity({
        game: "omaha",
        players: [{ hole: parseCards("Ac Ad") }, { hole: parseCards("Kc Kd") }],
      }),
    ).toThrow(/hole cards/i);
  });
  it("requires at least two players", () => {
    expect(() =>
      calculateEquity({ game: "holdem", players: [{ hole: parseCards("Ac Ad") }] }),
    ).toThrow(/2 players/i);
  });
});
