import { describe, it, expect } from "vitest";
import {
  currentLevel,
  nextLevel,
  memberStatus,
  agentProgress,
  isRakebackEligible,
  canEarnReferrals,
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

describe("isRakebackEligible", () => {
  it("L0 (unverified) players are not rakeback-eligible", () => {
    expect(isRakebackEligible({ kycVerified: false, tableHours: 0, directReferrals: 0 })).toBe(false);
  });

  it("L1+ (KYC verified) players are rakeback-eligible", () => {
    expect(isRakebackEligible({ kycVerified: true, tableHours: 0, directReferrals: 0 })).toBe(true);
  });

  it("L2 (VIP) players remain rakeback-eligible", () => {
    expect(isRakebackEligible({ kycVerified: true, tableHours: 4, directReferrals: 0 })).toBe(true);
  });
});

describe("canEarnReferrals", () => {
  it("L0 and L1 players cannot yet refer for their own commission", () => {
    expect(canEarnReferrals({ kycVerified: false, tableHours: 0, directReferrals: 0 })).toBe(false);
    expect(canEarnReferrals({ kycVerified: true, tableHours: 0, directReferrals: 0 })).toBe(false);
  });

  it("L2 (VIP) and above unlocks referral earning", () => {
    expect(canEarnReferrals({ kycVerified: true, tableHours: 4, directReferrals: 0 })).toBe(true);
    expect(canEarnReferrals({ kycVerified: true, tableHours: 10, directReferrals: 3 })).toBe(true);
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
