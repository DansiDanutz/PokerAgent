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
  it("is eligible once the network has 10+ VIP players", () => {
    const p = agentProgress({ vipNetworkCount: 10 });
    expect(p.eligible).toBe(true);
    expect(p.current).toBe(10);
    expect(p.target).toBe(10);
  });

  it("is eligible with more than the minimum too", () => {
    expect(agentProgress({ vipNetworkCount: 15 }).eligible).toBe(true);
  });

  it("is not eligible short of the threshold", () => {
    const p = agentProgress({ vipNetworkCount: 9 });
    expect(p.eligible).toBe(false);
    expect(p.current).toBe(9);
  });

  it("is not eligible with zero VIP players", () => {
    expect(agentProgress({ vipNetworkCount: 0 }).eligible).toBe(false);
  });
});
