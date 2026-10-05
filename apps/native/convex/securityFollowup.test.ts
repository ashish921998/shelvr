// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest";
import { newConvexTest } from "./test.setup";
import { api, internal } from "./_generated/api";
import { MAX_NOTE_TEXT_CHARS } from "./model/itemFields";
import { sha256Hex } from "./model/captureTokens";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("rejects oversized notes before persistence for ordinary and idempotent saves", async () => {
  const t = newConvexTest();
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("subscriptions", {
      userId: id,
      status: "pro",
      expiresAt: Date.now() + 100000,
      updatedAt: Date.now(),
    });
    return id;
  });
  const auth = t.withIdentity({ subject: `${userId}|session` });
  for (const operationId of [undefined, "note:security-followup"]) {
    await expect(
      auth.mutation(api.items.createNoteItem, {
        text: "x".repeat(MAX_NOTE_TEXT_CHARS + 1),
        operationId,
      }),
    ).rejects.toThrow("too long");
  }
  expect(await t.run((ctx) => ctx.db.query("items").take(1))).toEqual([]);
});

it("deferred steering requires a currently entitled owner and saved membership", async () => {
  const t = newConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "note",
      status: "ready",
      tags: [],
      searchText: "",
    });
    const spaceId = await ctx.db.insert("spaces", { userId, name: "Travel" });
    await ctx.db.insert("spaceItems", {
      userId,
      itemId,
      spaceId,
      status: "saved",
    });
    return { userId, itemId, spaceId };
  });
  expect(
    await t.mutation(internal.spaces.claimSteeringInternal, {
      itemId: ids.itemId,
      spaceId: ids.spaceId,
    }),
  ).toBe(false);
  await t.run((ctx) =>
    ctx.db.insert("subscriptions", {
      userId: ids.userId,
      status: "pro",
      expiresAt: Date.now() + 100000,
      updatedAt: Date.now(),
    }),
  );
  expect(
    await t.mutation(internal.spaces.claimSteeringInternal, {
      itemId: ids.itemId,
      spaceId: ids.spaceId,
    }),
  ).toBe(true);
});

it("an unconfirmed mailbox is excluded from provider sync and confirmation is single use", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const t = newConvexTest();
  const token = "a".repeat(64);
  await t.mutation(internal.waitlist.upsertSignup, {
    email: "pending@example.com",
    product: "shelvr-android",
    source: "hero",
    confirmationHash: await sha256Hex(token),
  });
  expect(
    await t.query(internal.waitlist.listSignupsNeedingResendSync, {}),
  ).toEqual([]);
  expect(
    await t.mutation(internal.waitlist.confirmSignup, { tokenHash: "invalid" }),
  ).toBeNull();
  const hash = await sha256Hex(token);
  expect(
    await t.mutation(internal.waitlist.confirmSignup, { tokenHash: hash }),
  ).not.toBeNull();
  expect(
    await t.mutation(internal.waitlist.confirmSignup, { tokenHash: hash }),
  ).toBeNull();
  expect(
    await t.query(internal.waitlist.listSignupsNeedingResendSync, {}),
  ).toHaveLength(1);
});

it("server expiry fences stale timers and ignores a caller-supplied past clock", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const t = newConvexTest();
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("subscriptions", {
      userId: id,
      status: "pro",
      expiresAt: 90000,
      updatedAt: 50000,
    });
    await ctx.db.insert("items", {
      userId: id,
      type: "note",
      status: "ready",
      tags: [],
      searchText: "",
    });
    return id;
  });
  await t.mutation(internal.subscriptions.expireSubscription, {
    userId,
    expiresAt: 80000,
  });
  const auth = t.withIdentity({ subject: `${userId}|session` });
  expect(
    await auth.query(api.items.listRecentItems, { limit: 5, now: 1 }),
  ).toHaveLength(1);
  await t.mutation(internal.subscriptions.expireSubscription, {
    userId,
    expiresAt: 90000,
  });
  expect(
    await auth.query(api.items.listRecentItems, { limit: 5, now: 1 }),
  ).toEqual([]);
  expect(await auth.query(api.items.listRecentItems, { limit: 5 })).toEqual([]);
});

it("unconfirmed rows cannot fill the confirmed provider retry window", async () => {
  const t = newConvexTest();
  await t.run(async (ctx) => {
    const base = {
      product: "shelvr" as const,
      source: "hero" as const,
      consentVersion: "test",
      consentText: "test",
      consentedAt: 0,
      firstSubmittedAt: 1,
      lastSubmittedAt: 1,
      resendStatus: "pending" as const,
      resendAttempts: 0,
    };
    for (let index = 0; index < 101; index++)
      await ctx.db.insert("waitlistSignups", {
        ...base,
        email: `pending-${index}@example.com`,
        confirmed: false,
      });
    await ctx.db.insert("waitlistSignups", {
      ...base,
      email: "confirmed@example.com",
      confirmed: true,
      confirmedAt: 1,
    });
  });
  expect(
    await t.query(internal.waitlist.listSignupsNeedingResendSync, {}),
  ).toEqual([expect.objectContaining({ email: "confirmed@example.com" })]);
});
