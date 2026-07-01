import { describe, it, expect } from "vitest";
import { computeMemberLine, commissionFor, summarizeTotals } from "./distribution";
import type { ClubggMemberStats } from "./statsImport";

const row = (over: Partial<ClubggMemberStats> = {}): ClubggMemberStats => ({
  clubggId: "8842014",
  nickname: "alex",
  handsPlayed: 1000,
  rake: 5000, // $50.00
  buyIn: 50000,
  cashOut: 71550,
  profitLoss: 21550,
  hours: 6,
  ...over,
});

describe("computeMemberLine", () => {
  it("pays personal rakeback to an eligible, matched player", () => {
    const line = computeMemberLine(row(), { id: "u1", username: "alex" }, { rakebackEligible: true, playerRakebackRate: 0.1 });
    expect(line.matched).toBe(true);
    expect(line.userId).toBe("u1");
    expect(line.rakebackEligible).toBe(true);
    expect(line.playerRakeback).toBe(500); // 5000 * 0.10
    expect(line.handsPlayed).toBe(1000);
    expect(line.tableHours).toBe(6);
    expect(line.netProfit).toBe(21550);
  });

  it("pays no rakeback to a matched-but-ineligible player", () => {
    const line = computeMemberLine(row(), { id: "u1", username: "alex" }, { rakebackEligible: false, playerRakebackRate: 0.1 });
    expect(line.matched).toBe(true);
    expect(line.rakebackEligible).toBe(false);
    expect(line.playerRakeback).toBe(0);
  });

  it("marks an unmatched row and pays nothing", () => {
    const line = computeMemberLine(row(), undefined, { rakebackEligible: true, playerRakebackRate: 0.1 });
    expect(line.matched).toBe(false);
    expect(line.userId).toBeUndefined();
    expect(line.playerRakeback).toBe(0);
  });

  it("defaults missing hours to 0", () => {
    const line = computeMemberLine(row({ hours: undefined }), { id: "u1", username: "alex" }, { rakebackEligible: true, playerRakebackRate: 0.1 });
    expect(line.tableHours).toBe(0);
  });

  it("rounds rakeback to the nearest cent", () => {
    const line = computeMemberLine(row({ rake: 333 }), { id: "u1", username: "alex" }, { rakebackEligible: true, playerRakebackRate: 0.1 });
    expect(line.playerRakeback).toBe(33); // 33.3 → 33
  });
});

describe("commissionFor", () => {
  it("multiplies and rounds", () => {
    expect(commissionFor(10000, 0.25)).toBe(2500);
    expect(commissionFor(333, 0.1)).toBe(33);
  });
  it("is zero at a zero rate", () => {
    expect(commissionFor(10000, 0)).toBe(0);
  });
});

describe("summarizeTotals", () => {
  it("aggregates matched/unmatched, rake, rakeback and commission", () => {
    const lines = [
      computeMemberLine(row({ clubggId: "1", rake: 5000 }), { id: "u1", username: "a" }, { rakebackEligible: true, playerRakebackRate: 0.1 }),
      computeMemberLine(row({ clubggId: "2", rake: 2000 }), undefined, { rakebackEligible: true, playerRakebackRate: 0.1 }),
    ];
    const settlements = [{ agentId: "ag1", username: "agent", periodRake: 5000, rate: 0.25, commission: 1250 }];
    const totals = summarizeTotals(lines, settlements);
    expect(totals.members).toBe(2);
    expect(totals.matched).toBe(1);
    expect(totals.unmatched).toBe(1);
    expect(totals.rake).toBe(7000);
    expect(totals.playerRakeback).toBe(500); // only the matched, eligible one
    expect(totals.commission).toBe(1250);
  });
});
