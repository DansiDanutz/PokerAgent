import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

  it("excludes L0 (unverified) players' rake from network rake and commission", async () => {
    // u_sara (pending), u_yuki and u_liam (unverified) are all L0 in the seed
    // and must not count toward Arjun's rake/commission until they hit L1.
    const summary = await repo.getNetworkSummary("u_arjun");
    expect(summary.networkRake).toBe(78_800); // 89_800 total minus the three L0 players' rake
    expect(summary.commissionEarned).toBe(15_760); // 20% of 78_800
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
    // u_yuki and u_diego share the same direct agent (u_marco), so this is a
    // permitted transfer shape — it should fail on balance, not on permission.
    await expect(
      repo.transfer({ fromUserId: "u_yuki", toReferralCode: "PA-DIEGO-03", amount: 999_999_999 }),
    ).rejects.toThrow(/insufficient/i);
  });

  it("approving a pending deposit credits the balance", async () => {
    const before = (await repo.getUser("u_sara"))!.balance;
    // t6 is Sara's pending 60_000 deposit in the seed.
    await repo.setTransactionStatus("t6", "approved", "u_admin");
    expect((await repo.getUser("u_sara"))!.balance).toBe(before + 60_000);
  });
});

describe("MemoryRepository — auth", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("finds a seeded credential by email (case-insensitive)", async () => {
    const cred = await repo.findAuthByEmail("SEMEBITCOIN@gmail.com");
    expect(cred?.id).toBe("u_admin");
    expect(cred?.passwordHash).toMatch(/^scrypt\$/);
  });

  it("creates a self-service account as a player with a password", async () => {
    const user = await repo.createAccount({
      username: "fresh",
      fullName: "Fresh Face",
      email: "fresh@face.com",
      passwordHash: "scrypt$aa$bb",
      uplineReferralCode: "PAGENT-ARJUN12",
    });
    expect(user.role).toBe("player");
    expect(user.uplineAgentId).toBe("u_arjun");
    expect((await repo.findAuthByEmail("fresh@face.com"))?.id).toBe(user.id);
  });

  it("rejects duplicate email or username on signup", async () => {
    await expect(
      repo.createAccount({ username: "x", fullName: "X", email: "semebitcoin@gmail.com", passwordHash: "h" }),
    ).rejects.toThrow(/email already exists/i);
    await expect(
      repo.createAccount({ username: "alexplayer", fullName: "X", email: "x@x.com", passwordHash: "h" }),
    ).rejects.toThrow(/username is taken/i);
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

  it("blocks rakeback for an L0 (unverified) player", async () => {
    // u_yuki is unverified (L0) in the seed.
    await expect(
      repo.creditMember({ agentId: "u_marco", memberId: "u_yuki", type: "rake_rebate", amount: 1_000 }),
    ).rejects.toThrow(/kyc|level 1/i);
  });

  it("still allows non-rakeback credits (deposit/adjustment) to an L0 player", async () => {
    const before = (await repo.getUser("u_yuki"))!.balance;
    await repo.creditMember({ agentId: "u_marco", memberId: "u_yuki", type: "adjustment", amount: 1_000 });
    expect((await repo.getUser("u_yuki"))!.balance).toBe(before + 1_000);
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

describe("MemoryRepository — transfer permissions (money flow)", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("allows player → player when both share the same direct agent", async () => {
    // u_liam and u_mia are both direct players of u_alex.
    await expect(
      repo.transfer({ fromUserId: "u_liam", toReferralCode: "PA-MIA-44", amount: 500 }),
    ).resolves.toBeTruthy();
  });

  it("blocks player → player across different agents", async () => {
    // u_alex is under u_arjun; u_tom is under u_nadia.
    await expect(
      repo.transfer({ fromUserId: "u_alex", toReferralCode: "PA-TOM-55", amount: 500 }),
    ).rejects.toThrow(/same agent/i);
  });

  it("allows a player to pay back any agent, not just their own", async () => {
    // u_alex's agent is u_arjun, but he pays back the unrelated agent u_nadia.
    await expect(
      repo.transfer({ fromUserId: "u_alex", toReferralCode: "PAGENT-NADIA7", amount: 500 }),
    ).resolves.toBeTruthy();
  });

  it("blocks player → admin", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_alex", toReferralCode: "ADMIN-ROOT", amount: 500 }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("allows a funded agent to send chips to a direct downline player", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_arjun", toReferralCode: "PA-ALEX-77", amount: 1_000 }),
    ).resolves.toBeTruthy();
  });

  it("allows a funded agent to send chips to an indirect downline player (via sub-agent)", async () => {
    // u_diego is under u_marco, who is under u_arjun.
    await expect(
      repo.transfer({ fromUserId: "u_arjun", toReferralCode: "PA-DIEGO-03", amount: 1_000 }),
    ).resolves.toBeTruthy();
  });

  it("blocks an agent from sending chips to a player outside their network", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_nadia", toReferralCode: "PA-ALEX-77", amount: 500 }),
    ).rejects.toThrow(/your own network/i);
  });

  it("blocks an agent from sending more chips than they hold", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_marco", toReferralCode: "PA-DIEGO-03", amount: 999_999_999 }),
    ).rejects.toThrow(/insufficient/i);
  });

  it("allows agent → agent transfers", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_arjun", toReferralCode: "PAGENT-NADIA7", amount: 1_000 }),
    ).resolves.toBeTruthy();
  });

  it("blocks admin from using transfer() at all", async () => {
    await expect(
      repo.transfer({ fromUserId: "u_admin", toReferralCode: "PA-ALEX-77", amount: 500 }),
    ).rejects.toThrow(/adjust balance/i);
  });
});

describe("MemoryRepository — creditMember is balance-backed", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("debits the agent and credits the member by the same amount", async () => {
    const agentBefore = (await repo.getUser("u_arjun"))!.balance;
    const memberBefore = (await repo.getUser("u_alex"))!.balance;
    await repo.creditMember({ agentId: "u_arjun", memberId: "u_alex", type: "adjustment", amount: 10_000 });
    expect((await repo.getUser("u_arjun"))!.balance).toBe(agentBefore - 10_000);
    expect((await repo.getUser("u_alex"))!.balance).toBe(memberBefore + 10_000);
  });

  it("rejects a credit that exceeds the agent's balance", async () => {
    await expect(
      repo.creditMember({ agentId: "u_arjun", memberId: "u_alex", type: "adjustment", amount: 999_999_999 }),
    ).rejects.toThrow(/insufficient/i);
  });

  it("always completes immediately — no pending sub-state", async () => {
    const tx = await repo.creditMember({ agentId: "u_arjun", memberId: "u_alex", type: "adjustment", amount: 1_000 });
    expect(tx.status).toBe("completed");
  });

  it("checks upline authorization before the balance check", async () => {
    // u_nadia is not in u_alex's network at all — should fail on authorization,
    // not surface a balance-related error.
    await expect(
      repo.creditMember({ agentId: "u_nadia", memberId: "u_alex", type: "adjustment", amount: 999_999_999 }),
    ).rejects.toThrow(/not authorized/i);
  });
});

describe("MemoryRepository — agent credit request & settlement", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("creates a pending agent_credit transaction without touching the balance", async () => {
    const before = (await repo.getUser("u_arjun"))!.balance;
    const tx = await repo.requestAgentCredit("u_arjun", 50_000, "need more float");
    expect(tx.status).toBe("pending");
    expect(tx.type).toBe("agent_credit");
    expect((await repo.getUser("u_arjun"))!.balance).toBe(before);
  });

  it("only agents can request credit", async () => {
    await expect(repo.requestAgentCredit("u_alex", 1_000)).rejects.toThrow(/only agents/i);
    await expect(repo.requestAgentCredit("u_admin", 1_000)).rejects.toThrow(/only agents/i);
  });

  it("only admin can decide a credit request", async () => {
    const tx = await repo.requestAgentCredit("u_arjun", 1_000);
    await expect(repo.decideAgentCredit("u_marco", tx.id, "approved")).rejects.toThrow(/admin only/i);
  });

  it("approving applies the balance and completes the transaction", async () => {
    const before = (await repo.getUser("u_arjun"))!.balance;
    const tx = await repo.requestAgentCredit("u_arjun", 50_000);
    const decided = await repo.decideAgentCredit("u_admin", tx.id, "approved");
    expect(decided.status).toBe("completed");
    expect((await repo.getUser("u_arjun"))!.balance).toBe(before + 50_000);
  });

  it("rejecting leaves the balance untouched", async () => {
    const before = (await repo.getUser("u_arjun"))!.balance;
    const tx = await repo.requestAgentCredit("u_arjun", 50_000);
    await repo.decideAgentCredit("u_admin", tx.id, "rejected");
    expect((await repo.getUser("u_arjun"))!.balance).toBe(before);
  });

  it("listAgentCreditRequests only shows pending ones; listSettlements shows everything", async () => {
    const tx1 = await repo.requestAgentCredit("u_arjun", 10_000);
    const tx2 = await repo.requestAgentCredit("u_marco", 5_000);
    await repo.decideAgentCredit("u_admin", tx1.id, "approved");

    const pending = await repo.listAgentCreditRequests();
    expect(pending.some((t) => t.id === tx1.id)).toBe(false);
    expect(pending.some((t) => t.id === tx2.id)).toBe(true);

    const all = await repo.listSettlements();
    expect(all.some((t) => t.id === tx1.id)).toBe(true);
    expect(all.some((t) => t.id === tx2.id)).toBe(true);
  });

  it("blocks new credit requests while the agent's balance is negative", async () => {
    await repo.adminAdjustBalance("u_admin", "u_arjun", -900_000, "force negative");
    expect((await repo.getUser("u_arjun"))!.balance).toBeLessThan(0);
    await expect(repo.requestAgentCredit("u_arjun", 1_000)).rejects.toThrow(/negative/i);
  });

  it("excludes agent_credit requests from the general pending-approvals queue", async () => {
    await repo.requestAgentCredit("u_arjun", 10_000);
    const pending = await repo.listPendingTransactions();
    expect(pending.every((t) => t.type !== "agent_credit")).toBe(true);
  });
});

describe("MemoryRepository — per-player credit limits", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("lets an agent set a credit limit on a direct player", async () => {
    const updated = await repo.setPlayerCreditLimit("u_arjun", "u_alex", 20_000);
    expect(updated.creditLimit).toBe(20_000);
  });

  it("rejects setting a limit on a non-direct (indirect) player", async () => {
    // u_diego is under u_marco, not directly under u_arjun.
    await expect(repo.setPlayerCreditLimit("u_arjun", "u_diego", 1_000)).rejects.toThrow(/your own players/i);
  });

  it("rejects when the new total would exceed the agent's balance", async () => {
    // u_arjun has 825_000; this single limit alone exceeds it.
    await expect(repo.setPlayerCreditLimit("u_arjun", "u_alex", 999_999_999)).rejects.toThrow(/exceed/i);
  });

  it("admin can bypass the aggregate-cap check", async () => {
    const updated = await repo.setPlayerCreditLimit("u_admin", "u_alex", 999_999_999);
    expect(updated.creditLimit).toBe(999_999_999);
  });
});

describe("MemoryRepository — daily negative-balance sweep", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("zeroes a negative player's balance and debits the exact amount from their direct agent", async () => {
    await repo.adminAdjustBalance("u_admin", "u_sara", -100_000, "force negative");
    const saraNegative = (await repo.getUser("u_sara"))!.balance;
    expect(saraNegative).toBeLessThan(0);
    const arjunBefore = (await repo.getUser("u_arjun"))!.balance;

    const sweeps = await repo.sweepNegativeBalances();
    const saraSweep = sweeps.find((s) => s.playerId === "u_sara")!;
    expect(saraSweep.agentId).toBe("u_arjun");
    expect(saraSweep.amount).toBe(-saraNegative);

    expect((await repo.getUser("u_sara"))!.balance).toBe(0);
    expect((await repo.getUser("u_arjun"))!.balance).toBe(arjunBefore + saraNegative);
  });

  it("leaves agents of unaffected (non-negative) players untouched", async () => {
    const nadiaBefore = (await repo.getUser("u_nadia"))!.balance;
    await repo.adminAdjustBalance("u_admin", "u_sara", -100_000, "force negative");
    await repo.sweepNegativeBalances();
    expect((await repo.getUser("u_nadia"))!.balance).toBe(nadiaBefore);
  });

  it("flags and reflects an agent pushed negative by the sweep in getNetworkSummary().frozen", async () => {
    // Push Sara deep enough negative that absorbing it also pushes Arjun negative.
    await repo.adminAdjustBalance("u_admin", "u_sara", -1_000_000, "force deep negative");
    const sweeps = await repo.sweepNegativeBalances();
    const saraSweep = sweeps.find((s) => s.playerId === "u_sara")!;
    expect(saraSweep.agentNowNegative).toBe(true);

    const summary = await repo.getNetworkSummary("u_arjun");
    expect(summary.frozen).toBe(true);
    expect(summary.commissionEarned).toBe(0);
  });
});

describe("MemoryRepository — dormant-user free agency", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks changing agent before a year of inactivity", async () => {
    // u_alex's seeded lastActiveAt is recent — not dormant under real time.
    await expect(repo.changeUpline("u_alex", "PAGENT-NADIA7")).rejects.toThrow(/inactivity/i);
  });

  it("lets a dormant user switch to a new agent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-01T00:00:00.000Z")); // well over a year past seed lastActiveAt
    const updated = await repo.changeUpline("u_alex", "PAGENT-NADIA7");
    expect(updated.uplineAgentId).toBe("u_nadia");
  });

  it("rejects an unknown referral code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-01T00:00:00.000Z"));
    await expect(repo.changeUpline("u_alex", "NOPE-CODE")).rejects.toThrow(/no user found/i);
  });

  it("rejects switching to the agent you're already with", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-01T00:00:00.000Z"));
    await expect(repo.changeUpline("u_alex", "PAGENT-ARJUN12")).rejects.toThrow(/already with/i);
  });

  it("rejects a switch that would create a loop (new agent is your own descendant)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-01T00:00:00.000Z"));
    // u_liam is one of u_alex's own players — looping alex under liam is invalid.
    await expect(repo.changeUpline("u_alex", "PA-LIAM-31")).rejects.toThrow(/loop/i);
  });

  it("notifies the user, the old agent, and the new agent on a successful switch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-01T00:00:00.000Z"));
    await repo.changeUpline("u_alex", "PAGENT-NADIA7");

    const alexNotifs = await repo.listNotifications("u_alex");
    expect(alexNotifs.some((n) => /agent changed/i.test(n.title))).toBe(true);

    const arjunNotifs = await repo.listNotifications("u_arjun");
    expect(arjunNotifs.some((n) => /dormant member left/i.test(n.title))).toBe(true);

    const nadiaNotifs = await repo.listNotifications("u_nadia");
    expect(nadiaNotifs.some((n) => /new member joined/i.test(n.title))).toBe(true);
  });
});
