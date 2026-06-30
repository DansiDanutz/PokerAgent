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

  it("agent promotion is request → admin approval (agents cannot self-promote)", async () => {
    // Player requests…
    const requested = await repo.requestAgentStatus("u_noah");
    expect(requested.agentRequest).toBe("pending");
    expect((await repo.listAgentRequests()).some((u) => u.id === "u_noah")).toBe(true);
    // …a non-admin cannot approve…
    await expect(repo.decideAgentRequest("u_arjun", "u_noah", "approved")).rejects.toThrow(/admin only/i);
    // …only the admin can.
    const approved = await repo.decideAgentRequest("u_admin", "u_noah", "approved");
    expect(approved.role).toBe("agent");
    expect(approved.agentRequest).toBe("none");
  });

  it("only semebitcoin@gmail.com can hold admin", async () => {
    await expect(repo.setUserRole("u_admin", "u_arjun", "admin")).rejects.toThrow(/can be admin/i);
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

describe("MemoryRepository — admin controls", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("verifies KYC", async () => {
    const u = await repo.setKycStatus("u_admin", "u_sara", "verified");
    expect(u.kycStatus).toBe("verified");
  });

  it("suspends and bans accounts", async () => {
    expect((await repo.setAccountStatus("u_admin", "u_yuki", "suspended")).status).toBe("suspended");
    expect((await repo.setAccountStatus("u_admin", "u_yuki", "banned")).status).toBe("banned");
  });

  it("changes a user's role (promote & demote)", async () => {
    expect((await repo.setUserRole("u_admin", "u_alex", "agent")).role).toBe("agent");
    expect((await repo.setUserRole("u_admin", "u_marco", "player")).role).toBe("player");
  });

  it("applies a signed balance adjustment", async () => {
    const before = (await repo.getUser("u_tom"))!.balance;
    await repo.adminAdjustBalance("u_admin", "u_tom", -5_000, "correction");
    expect((await repo.getUser("u_tom"))!.balance).toBe(before - 5_000);
  });

  it("rejects admin actions from non-admins", async () => {
    await expect(repo.setKycStatus("u_arjun", "u_sara", "verified")).rejects.toThrow(/admin only/i);
    await expect(repo.setUserRole("u_arjun", "u_alex", "agent")).rejects.toThrow(/admin only/i);
    await expect(repo.adminAdjustBalance("u_arjun", "u_tom", 100)).rejects.toThrow(/admin only/i);
  });

  it("creates a member under an upline and derives a referral code", async () => {
    const created = await repo.createMember("u_admin", {
      username: "newguy",
      fullName: "New Guy",
      email: "new@guy.com",
      uplineReferralCode: "PAGENT-ARJUN12",
      balance: 5_000,
    });
    expect(created.uplineAgentId).toBe("u_arjun");
    expect(created.referralCode).toMatch(/^PA-NEWGUY-/);
    expect(created.balance).toBe(5_000);
    // Now appears in Arjun's downline.
    expect((await repo.listDownline("u_arjun")).some((u) => u.id === created.id)).toBe(true);
  });

  it("rejects duplicate usernames and bad upline codes", async () => {
    await expect(
      repo.createMember("u_admin", { username: "alexplayer", fullName: "Dupe", email: "d@d.com" }),
    ).rejects.toThrow(/already exists/i);
    await expect(
      repo.createMember("u_admin", { username: "zzz", fullName: "Z", email: "z@z.com", uplineReferralCode: "NOPE" }),
    ).rejects.toThrow(/unknown upline/i);
  });
});
