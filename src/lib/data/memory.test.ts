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
    // alex now has 3 of his own players → his subtree is 3.
    const alex = tree!.children.find((c) => c.user.id === "u_alex")!;
    expect(alex.subtreeSize).toBe(3);
    // alex(+3), sara, marco(+diego,yuki) = 8 descendants under arjun.
    expect(tree!.subtreeSize).toBe(8);
  });

  it("summarizes commission from network rake", async () => {
    const summary = await repo.getNetworkSummary("u_arjun");
    expect(summary.directReferrals).toBe(3);
    expect(summary.totalNetwork).toBe(8);
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

describe("MemoryRepository — agent member management", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("knows the upline chain (Arjun → Marco → Diego)", async () => {
    expect(await repo.isUpline("u_arjun", "u_diego")).toBe(true);
    expect(await repo.isUpline("u_marco", "u_diego")).toBe(true);
    expect(await repo.isUpline("u_marco", "u_alex")).toBe(false);
    expect(await repo.isUpline("u_nadia", "u_alex")).toBe(false);
  });

  it("lists the whole downline", async () => {
    expect((await repo.listDownline("u_arjun")).length).toBe(8);
    expect((await repo.listDownline("u_alex")).map((u) => u.id).sort()).toEqual(
      ["u_liam", "u_mia", "u_noah"].sort(),
    );
  });

  it("credits a downline member and moves their balance", async () => {
    const before = (await repo.getUser("u_diego"))!.balance;
    await repo.creditMember({ agentId: "u_arjun", memberId: "u_diego", type: "rake_rebate", amount: 2_500 });
    expect((await repo.getUser("u_diego"))!.balance).toBe(before + 2_500);
  });

  it("refuses to credit someone outside the agent's network", async () => {
    await expect(
      repo.creditMember({ agentId: "u_nadia", memberId: "u_alex", type: "adjustment", amount: 100 }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("logs table hours (which can lift the member's level)", async () => {
    const updated = await repo.setMemberTableHours("u_alex", "u_mia", 6);
    expect(updated.stats.tableHours).toBe(6);
  });

  it("promotes a downline player to agent", async () => {
    const promoted = await repo.promoteToAgent("u_alex", "u_noah");
    expect(promoted.role).toBe("agent");
  });

  it("lets an upline agent approve a member's pending request", async () => {
    const before = (await repo.getUser("u_alex"))!.balance;
    // t3 is Alex's pending -20_000 withdrawal; Arjun is Alex's upline.
    await repo.decideMemberTransaction("u_arjun", "t3", "approved");
    expect((await repo.getUser("u_alex"))!.balance).toBe(before - 20_000);
  });

  it("blocks approving a request outside the network", async () => {
    await expect(repo.decideMemberTransaction("u_nadia", "t3", "approved")).rejects.toThrow(
      /not authorized/i,
    );
  });
});
