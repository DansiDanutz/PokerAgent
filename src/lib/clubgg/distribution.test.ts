import { describe, it, expect } from "vitest";
import { splitRake, planDistribution, type DistributionContext } from "./distribution";
import type { ClubggMemberStats } from "./statsImport";

describe("splitRake — differential override", () => {
  it("splits a single agent over a player, admin keeps the residual", () => {
    // player 10%, agent 25% → player 10, agent 15, admin 75.
    const { player, agents, admin } = splitRake(10000, [0.1, 0.25]);
    expect(player).toBe(1000);
    expect(agents).toEqual([1500]);
    expect(admin).toBe(7500);
    expect(player + agents[0] + admin).toBe(10000);
  });

  it("telescopes a nested agent chain so every level earns its spread", () => {
    // player 10%, agent 25%, super 40% → 10 / 15 / 15 / admin 60.
    const { player, agents, admin } = splitRake(10000, [0.1, 0.25, 0.4]);
    expect(player).toBe(1000);
    expect(agents).toEqual([1500, 1500]);
    expect(admin).toBe(6000);
    expect(player + agents[0] + agents[1] + admin).toBe(10000);
  });

  it("clamps a non-increasing rate to 0 for that level", () => {
    // agent below the player rate earns nothing; admin keeps 90%.
    const { player, agents, admin } = splitRake(10000, [0.1, 0.0]);
    expect(player).toBe(1000);
    expect(agents).toEqual([0]);
    expect(admin).toBe(9000);
  });

  it("always reconciles to the cent (admin absorbs rounding)", () => {
    const { player, agents, admin } = splitRake(333, [0.1, 0.25, 0.4]);
    expect(player + agents.reduce((s, a) => s + a, 0) + admin).toBe(333);
  });
});

// --- planDistribution over a small linked tree -----------------------------

const row = (over: Partial<ClubggMemberStats> = {}): ClubggMemberStats => ({
  clubggId: "x",
  handsPlayed: 100,
  rake: 10000,
  buyIn: 0,
  cashOut: 0,
  profitLoss: 0,
  ...over,
});

// diego → marco (agent 25%) → arjun (agent 40%); noah & liam → arjun; liam is
// L0. marco is himself an agent (owns his own cash flow); root sits under admin.
function ctx(): DistributionContext {
  const chains: Record<string, string[]> = {
    diego: ["marco", "arjun"],
    noah: ["arjun"],
    liam: ["arjun"],
    marco: ["arjun"],
  };
  return {
    playerRakebackRate: 0.1,
    membersByClubId: new Map([
      ["cg_diego", { id: "diego", username: "diego" }],
      ["cg_noah", { id: "noah", username: "noah" }],
      ["cg_liam", { id: "liam", username: "liam" }],
      ["cg_marco", { id: "marco", username: "marco" }],
      ["cg_root", { id: "root", username: "root" }],
    ]),
    rakebackEligible: (id) => id !== "liam", // liam is L0
    agentChainOf: (id) => chains[id] ?? [],
    agentRate: (id) => (id === "marco" ? 0.25 : id === "arjun" ? 0.4 : 0),
    agentUsername: (id) => id,
    // marco is an agent → owns his own cash flow; players → nearest agent;
    // root sits directly under admin → null (house absorbs).
    cashflowOwnerOf: (id) => (id === "marco" ? "marco" : id === "root" ? null : (chains[id] ?? [])[0] ?? null),
  };
}

describe("planDistribution — 3-way accounting", () => {
  it("distributes a nested player across both agents + admin", () => {
    const plan = planDistribution([row({ clubggId: "cg_diego", rake: 10000 })], ctx());
    const line = plan.lines[0];
    expect(line.playerRakeback).toBe(1000); // 10%
    expect(line.agentShare).toBe(3000); // marco 15% + arjun 15%
    expect(line.adminShare).toBe(6000); // 60%
    // Settlements: marco 1500, arjun 1500.
    expect(plan.settlements.find((s) => s.agentId === "marco")!.commission).toBe(1500);
    expect(plan.settlements.find((s) => s.agentId === "arjun")!.commission).toBe(1500);
  });

  it("sends an ineligible (L0) player's whole rake to the house", () => {
    const plan = planDistribution([row({ clubggId: "cg_liam", rake: 5000 })], ctx());
    const line = plan.lines[0];
    expect(line.rakebackEligible).toBe(false);
    expect(line.playerRakeback).toBe(0);
    expect(line.agentShare).toBe(0);
    expect(line.adminShare).toBe(5000);
    expect(plan.settlements).toHaveLength(0);
  });

  it("holds an unlinked row's rake at the house and warns", () => {
    const plan = planDistribution([row({ clubggId: "ghost", rake: 2000 })], ctx());
    expect(plan.lines[0].matched).toBe(false);
    expect(plan.lines[0].adminShare).toBe(2000);
    expect(plan.warnings.join(" ")).toMatch(/ghost/i);
  });

  it("keeps the grand-total invariant: players + agents + admin === total rake", () => {
    const plan = planDistribution(
      [
        row({ clubggId: "cg_diego", rake: 10000 }),
        row({ clubggId: "cg_noah", rake: 4000 }),
        row({ clubggId: "cg_liam", rake: 5000 }),
        row({ clubggId: "ghost", rake: 2000 }),
      ],
      ctx(),
    );
    const t = plan.totals;
    expect(t.rake).toBe(21000);
    expect(t.playerRakeback + t.commission + t.adminKept).toBe(t.rake);
    // noah under arjun(40%): player 400, arjun (40-10)=30% → 1200, admin 2400.
    expect(t.playerRakeback).toBe(1000 + 400); // diego + noah (liam ineligible)
    expect(t.commission).toBe(3000 + 1200); // diego chain + noah→arjun
  });
});

describe("planDistribution — cross-network game-money settlement", () => {
  it("nets each network's P/L onto its cash-flow owner: pay winners, collect losers", () => {
    // Arjun's players: noah +50000, liam −20000 → arjun net +30000 (admin pays).
    // Marco's player diego −30000 AND marco's own play −10000 → marco −40000 (admin collects).
    const plan = planDistribution(
      [
        row({ clubggId: "cg_noah", profitLoss: 50000 }),
        row({ clubggId: "cg_liam", profitLoss: -20000 }),
        row({ clubggId: "cg_diego", profitLoss: -30000 }),
        row({ clubggId: "cg_marco", profitLoss: -10000 }),
      ],
      ctx(),
    );
    const arjun = plan.gameSettlements.find((g) => g.agentId === "arjun")!;
    const marco = plan.gameSettlements.find((g) => g.agentId === "marco")!;
    expect(arjun.networkPnl).toBe(30000); // admin PAYS arjun
    expect(marco.networkPnl).toBe(-40000); // admin COLLECTS from marco
    expect(plan.totals.payToAgents).toBe(30000);
    expect(plan.totals.collectFromAgents).toBe(40000);
  });

  it("includes L0 (KYC-ineligible) players — game money is owed regardless of verification", () => {
    const plan = planDistribution([row({ clubggId: "cg_liam", profitLoss: -20000 })], ctx());
    expect(plan.gameSettlements.find((g) => g.agentId === "arjun")!.networkPnl).toBe(-20000);
  });

  it("house absorbs P/L of players sitting directly under admin and of unmatched rows", () => {
    const plan = planDistribution(
      [row({ clubggId: "cg_root", profitLoss: 70000 }), row({ clubggId: "ghost", profitLoss: -5000 })],
      ctx(),
    );
    expect(plan.gameSettlements).toHaveLength(0);
    expect(plan.totals.payToAgents).toBe(0);
    expect(plan.totals.collectFromAgents).toBe(0);
  });

  it("attributes a nested sub-agent's players to the sub-agent, not the super-agent", () => {
    const plan = planDistribution([row({ clubggId: "cg_diego", profitLoss: 15000 })], ctx());
    expect(plan.gameSettlements).toHaveLength(1);
    expect(plan.gameSettlements[0].agentId).toBe("marco"); // diego's cash-flow owner
    expect(plan.gameSettlements[0].networkPnl).toBe(15000);
  });

  it("zero-sum file: pay and collect offset exactly", () => {
    // noah +25000 (arjun's network), diego −25000 (marco's network).
    const plan = planDistribution(
      [row({ clubggId: "cg_noah", profitLoss: 25000 }), row({ clubggId: "cg_diego", profitLoss: -25000 })],
      ctx(),
    );
    expect(plan.totals.payToAgents).toBe(plan.totals.collectFromAgents);
  });
});
