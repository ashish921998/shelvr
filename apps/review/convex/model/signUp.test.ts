// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { addUser, newConvexTest } from "../test.setup";
import { signInUser } from "./signUp";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVIEW_STAFF_EMAILS", "boss@shelvr.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  const t = newConvexTest();
  const boss = await addUser(t, "boss@shelvr.app");
  const campaignId = await boss.as.mutation(api.campaigns.create, {
    name: "Launch",
  });
  return { t, boss, campaignId };
}

function signIn(
  t: ReturnType<typeof newConvexTest>,
  email: string,
  existingUserId: Id<"users"> | null = null,
) {
  return t.run((ctx) => signInUser(ctx, { existingUserId, email }));
}

describe("signInUser", () => {
  test("an invited person joins the campaign on their first sign-in", async () => {
    const { t, boss, campaignId } = await setup();
    await boss.as.mutation(api.campaigns.invite, {
      campaignId,
      email: "New.Creator@Example.com",
      role: "creator",
    });
    const userId = await signIn(t, "new.creator@example.com");
    const members = await t.run((ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(members).toMatchObject([{ campaignId, role: "creator" }]);
    const invites = await t.run((ctx) => ctx.db.query("invites").collect());
    expect(invites).toEqual([]);
  });

  test("an existing user claims invites made before they signed in again", async () => {
    const { t, campaignId } = await setup();
    const alice = await addUser(t, "alice@example.com");
    await t.run((ctx) =>
      ctx.db.insert("invites", {
        campaignId,
        email: "alice@example.com",
        role: "admin",
        invitedBy: alice.userId,
      }),
    );
    expect(await signIn(t, "alice@example.com", alice.userId)).toBe(
      alice.userId,
    );
    const member = await t.run((ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_campaignId_and_userId", (q) =>
          q.eq("campaignId", campaignId).eq("userId", alice.userId),
        )
        .unique(),
    );
    expect(member?.role).toBe("admin");
  });

  test("finds an existing account by email", async () => {
    const { t, boss } = await setup();
    expect(await signIn(t, "BOSS@shelvr.app")).toBe(boss.userId);
  });

  test("staff can sign up; strangers cannot", async () => {
    const { t } = await setup();
    vi.stubEnv("REVIEW_STAFF_EMAILS", "boss@shelvr.app,ops@shelvr.app");
    await expect(signIn(t, "ops@shelvr.app")).resolves.toBeTruthy();
    await expect(signIn(t, "eve@example.com")).rejects.toThrow("invite only");
  });
});
