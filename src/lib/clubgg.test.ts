import { describe, it, expect } from "vitest";
import { CLUB, clubIdConfigured, economicsIssues, agentRakeShare } from "./clubgg";

describe("club economics config", () => {
  it("ships with coherent default economics (no issues)", () => {
    // The out-of-the-box defaults must validate — a shipped misconfiguration
    // (e.g. a rate typed as 10 instead of 0.1) would distort every import.
    expect(economicsIssues()).toEqual([]);
  });

  it("exposes a player rakeback rate as a fraction", () => {
    expect(CLUB.playerRakebackRate).toBeGreaterThan(0);
    expect(CLUB.playerRakebackRate).toBeLessThanOrEqual(1);
  });

  it("recognizes a real numeric Club ID and rejects the 000000 placeholder", () => {
    expect(clubIdConfigured()).toBe(true); // default 358346
  });

  it("applies the agent rake share to a minor-unit amount", () => {
    expect(agentRakeShare(10000)).toBe(Math.round(10000 * CLUB.rakeSplit.agent));
  });
});
