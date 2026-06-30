import { describe, it, expect } from "vitest";
import {
  currentLevel,
  nextLevel,
  memberStatus,
  agentProgress,
} from "./levels";

describe("currentLevel / memberStatus", () => {
  it("is New Player (L0) on signup only", () => {
    const input = { kycVerified: false, tableHours: 0, directReferrals: 0 };
    expect(currentLevel(input).level).toBe(0);
    expect(memberStatus(input)).toBe("new_player");
  });

  it("is Player (L1) after KYC", () => {
    const input = { kycVerified: true, tableHours: 0, directReferrals: 0 };
    expect(currentLevel(input).level).toBe(1);
    expect(memberStatus(input)).toBe("player");
  });

  it("is VIP Player (L2) after KYC + 4h played", () => {
    const input = { kycVerified: true, tableHours: 4, directReferrals: 0 };
    expect(currentLevel(input).level).toBe(2);
    expect(memberStatus(input)).toBe("vip_player");
  });

  it("does not reach VIP with under 4h", () => {
    const input = { kycVerified: true, tableHours: 3.9, directReferrals: 0 };
    expect(currentLevel(input).level).toBe(1);
  });

  it("does not skip levels: 4h played but no KYC stays New Player", () => {
    const input = { kycVerified: false, tableHours: 50, directReferrals: 20 };
    expect(currentLevel(input).level).toBe(0);
  });

  it("climbs to L3 with referrals once VIP", () => {
    const input = { kycVerified: true, tableHours: 10, directReferrals: 3 };
    expect(currentLevel(input).level).toBe(3);
  });

  it("reports the next level to chase", () => {
    expect(nextLevel({ kycVerified: false, tableHours: 0, directReferrals: 0 })?.level).toBe(1);
    expect(nextLevel({ kycVerified: true, tableHours: 4, directReferrals: 0 })?.level).toBe(3);
  });
});

describe("agentProgress", () => {
  it("tracks each promotion requirement", () => {
    const p = agentProgress({ level: 2, directReferrals: 3, vipReferrals: 1 });
    expect(p.eligible).toBe(true);
    expect(p.completed).toBe(3);
  });

  it("is not eligible when short on referrals", () => {
    const p = agentProgress({ level: 2, directReferrals: 1, vipReferrals: 0 });
    expect(p.eligible).toBe(false);
    expect(p.items.find((i) => i.key === "referrals")?.done).toBe(false);
  });
});
