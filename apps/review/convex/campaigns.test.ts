// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMember, addUser, newConvexTest } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVIEW_STAFF_EMAILS", "Boss@Shelvr.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function staffCampaign() {
  const t = newConvexTest();
  const boss = await addUser(t, "boss@shelvr.app");
  const campaignId = await boss.as.mutation(api.campaigns.create, {
    name: "  Lisbon launch  ",
  });
  return { t, boss, campaignId };
}

describe("campaigns", () => {
  test("staff start a campaign and become its admin", async () => {
    const { boss, campaignId } = await staffCampaign();
    expect(await boss.as.query(api.campaigns.me, {})).toMatchObject({
      isStaff: true,
    });
    const list = await boss.as.query(api.campaigns.list, {});
    expect(list).toEqual([
      { _id: campaignId, name: "Lisbon launch", role: "admin" },
    ]);
  });

  test("a creator cannot start a campaign", async () => {
    const t = newConvexTest();
    const creator = await addUser(t, "creator@example.com");
    await expect(
      creator.as.mutation(api.campaigns.create, { name: "Mine" }),
    ).rejects.toThrow("Only Shelvr staff");
  });

  test("signed-out callers see nothing", async () => {
    const { t, campaignId } = await staffCampaign();
    expect(await t.query(api.campaigns.me, {})).toBeNull();
    expect(await t.query(api.campaigns.list, {})).toEqual([]);
    expect(await t.query(api.campaigns.get, { campaignId })).toBeNull();
  });

  test("inviting a new email leaves a pending invite", async () => {
    const { boss, campaignId } = await staffCampaign();
    const result = await boss.as.mutation(api.campaigns.invite, {
      campaignId,
      email: " New@Creator.com ",
      role: "creator",
    });
    expect(result).toBe("invited");
    const campaign = await boss.as.query(api.campaigns.get, { campaignId });
    expect(campaign?.invites).toMatchObject([
      { email: "new@creator.com", role: "creator" },
    ]);
  });

  test("inviting a known user adds them straight away", async () => {
    const { t, boss, campaignId } = await staffCampaign();
    const friend = await addUser(t, "friend@example.com");
    const result = await boss.as.mutation(api.campaigns.invite, {
      campaignId,
      email: "friend@example.com",
      role: "creator",
    });
    expect(result).toBe("added");
    const theirs = await friend.as.query(api.campaigns.list, {});
    expect(theirs.map((c) => c._id)).toEqual([campaignId]);
  });

  test("creators cannot invite and do not see emails", async () => {
    const { t, campaignId } = await staffCampaign();
    const creator = await addMember(t, campaignId, "c@example.com", "creator");
    await expect(
      creator.as.mutation(api.campaigns.invite, {
        campaignId,
        email: "x@example.com",
        role: "admin",
      }),
    ).rejects.toThrow("Only admins");
    const campaign = await creator.as.query(api.campaigns.get, { campaignId });
    expect(campaign?.members.every((m) => m.email === null)).toBe(true);
    expect(campaign?.invites).toEqual([]);
  });

  test("a bad email is refused", async () => {
    const { boss, campaignId } = await staffCampaign();
    await expect(
      boss.as.mutation(api.campaigns.invite, {
        campaignId,
        email: "not-an-email",
        role: "creator",
      }),
    ).rejects.toThrow("doesn't look right");
  });

  test("an admin can remove others but not themselves", async () => {
    const { t, boss, campaignId } = await staffCampaign();
    const creator = await addMember(t, campaignId, "c@example.com", "creator");
    const campaign = await boss.as.query(api.campaigns.get, { campaignId });
    const mine = campaign!.members.find((m) => m.isYou)!;
    const theirs = campaign!.members.find((m) => !m.isYou)!;
    await expect(
      boss.as.mutation(api.campaigns.removeMember, { memberId: mine._id }),
    ).rejects.toThrow("can't remove yourself");
    await boss.as.mutation(api.campaigns.removeMember, {
      memberId: theirs._id,
    });
    expect(
      await creator.as.query(api.campaigns.get, { campaignId }),
    ).toBeNull();
  });

  test("an admin can revoke an invite and edit the brief", async () => {
    const { boss, campaignId } = await staffCampaign();
    await boss.as.mutation(api.campaigns.invite, {
      campaignId,
      email: "later@example.com",
      role: "creator",
    });
    const before = await boss.as.query(api.campaigns.get, { campaignId });
    await boss.as.mutation(api.campaigns.revokeInvite, {
      inviteId: before!.invites[0]._id,
    });
    await boss.as.mutation(api.campaigns.updateBrief, {
      campaignId,
      brief: "Golden hour, vertical, 30s",
    });
    const after = await boss.as.query(api.campaigns.get, { campaignId });
    expect(after?.invites).toEqual([]);
    expect(after?.brief).toBe("Golden hour, vertical, 30s");
  });

  test("the last admin cannot be demoted", async () => {
    const { t, boss, campaignId } = await staffCampaign();
    await expect(
      boss.as.mutation(api.campaigns.invite, {
        campaignId,
        email: "boss@shelvr.app",
        role: "creator",
      }),
    ).rejects.toThrow("at least one admin");
    await addMember(t, campaignId, "ops@shelvr.app", "admin");
    await expect(
      boss.as.mutation(api.campaigns.invite, {
        campaignId,
        email: "boss@shelvr.app",
        role: "creator",
      }),
    ).resolves.toBe("added");
  });
});
