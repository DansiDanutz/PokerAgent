import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "./memory";

describe("MemoryRepository — network rollups", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("builds Arjun's tree with the sub-agent's players nested", async () => {
    const tree = await repo.getNetworkTree("u_arjun");
    expect(tree).not.toBeNull();
    // Arjun directly refers Alex, Sara and the sub-agent Marco.
    expect(tree!.children.map((c) => c.user.id).sort()).toEqual(
      ["u_alex", "u_marco", "u_sara"].sort(),
    );
    // Marco's two players are nested under him → subtree size includes them.
    const marco = tree!.children.find((c) => c.user.id === "u_marco")!;
    expect(marco.subtreeSize).toBe(2);
    expect(tree!.subtreeSize).toBe(5); // alex, sara, marco, diego, yuki
  });

  it("summarizes commission from network rake", async () => {
    const summary = await repo.getNetworkSummary("u_arjun");
    expect(summary.directReferrals).toBe(3);
    expect(summary.totalNetwork).toBe(5);
    expect(summary.commissionEarned).toBeGreaterThan(0);
  });
});

describe("MemoryRepository — transfers", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("moves balance between users and records both legs", async () => {
    const alexBefore = (await repo.getUser("u_alex"))!.balance;
    const saraBefore = (await repo.getUser("u_sara"))!.balance;

    await repo.transfer({
      fromUserId: "u_alex",
      toReferralCode: "PA-SARA-21",
      amount: 10_000,
      note: "test",
    });

    expect((await repo.getUser("u_alex"))!.balance).toBe(alexBefore - 10_000);
    expect((await repo.getUser("u_sara"))!.balance).toBe(saraBefore + 10_000);
  });

  it("rejects overdrafts", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_yuki", toReferralCode: "PA-ALEX-77", amount: 999_999_999 }),
    ).rejects.toThrow(/insufficient/i);
  });

  it("approving a pending deposit credits the balance", async () => {
    const before = (await repo.getUser("u_sara"))!.balance;
    // t6 is Sara's pending 60_000 deposit in the seed.
    await repo.setTransactionStatus("t6", "approved", "u_admin");
    expect((await repo.getUser("u_sara"))!.balance).toBe(before + 60_000);
  });
});
