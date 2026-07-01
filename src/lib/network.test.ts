import { describe, it, expect } from "vitest";
import { flattenNetwork, flattenOwnBusiness } from "./network";
import type { NetworkNode } from "@/types/domain";

function node(
  id: string,
  role: "player" | "agent" | "admin",
  children: NetworkNode[] = [],
): NetworkNode {
  return {
    user: {
      id,
      username: id,
      fullName: id,
      role,
      balance: 0,
      currency: "USD",
      kycStatus: "verified",
      stats: {
        handsPlayed: 0,
        netProfit: 0,
        rakeGenerated: 0,
        winRateBb100: 0,
        sessions: 0,
        tableHours: 10,
      },
    },
    children,
    subtreeSize: children.length,
    subtreeRake: 0,
  };
}

describe("flattenOwnBusiness", () => {
  it("matches flattenNetwork when there are no nested agents", () => {
    const tree = node("root", "agent", [
      node("a", "player", [node("a1", "player")]),
      node("b", "player"),
    ]);
    expect(flattenOwnBusiness(tree).map((n) => n.user.id).sort()).toEqual(
      flattenNetwork(tree).map((n) => n.user.id).sort(),
    );
  });

  it("includes a nested agent node itself but stops before their downline", () => {
    const tree = node("root", "agent", [
      node("subAgent", "agent", [node("subPlayer1", "player"), node("subPlayer2", "player")]),
      node("directPlayer", "player"),
    ]);
    const own = flattenOwnBusiness(tree).map((n) => n.user.id);
    expect(own).toContain("subAgent");
    expect(own).toContain("directPlayer");
    expect(own).not.toContain("subPlayer1");
    expect(own).not.toContain("subPlayer2");
  });

  it("stops independently per branch — one nested agent doesn't affect a sibling branch", () => {
    const tree = node("root", "agent", [
      node("subAgent", "agent", [node("subPlayer", "player")]),
      node("directPlayer", "player", [node("grandchild", "player")]),
    ]);
    const own = flattenOwnBusiness(tree).map((n) => n.user.id);
    expect(own).toContain("grandchild");
    expect(own).not.toContain("subPlayer");
  });
});
