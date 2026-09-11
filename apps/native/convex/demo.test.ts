// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { DEMO_USED, MAX_DEMO_RETRIES } from "./demo";

type TestCtx = TestConvexForDataModel<import("./_generated/dataModel").DataModel>;
type TestBackend = ReturnType<typeof newConvexTest>;

// One backend per test, then per-user identity accessors on it — so tests that
// care about ownership/isolation really run two identities against the SAME
// database, not two isolated test databases.
async function asUser(
  backend: TestBackend,
  userId: string,
  opts?: { pro: boolean },
): Promise<TestCtx> {
  const t = backend.withIdentity({
    subject: `${userId}|session-1`,
  });
  if (opts?.pro !== false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      });
    });
  }
  return t;
}

const URL = "https://www.bbcgoodfood.com/recipes/classic-lasagne";

describe("onboarding demo allowance", () => {
  it("creates one real processing item and schedules the AI pipeline once", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    const { itemId, reused, savedSpaceNames } = await t.mutation(
      api.demo.createDemoItem,
      { url: URL },
    );
    expect(reused).toBe(false);
    expect(savedSpaceNames).toEqual([]);

    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item).toMatchObject({
      userId: "demo-user",
      type: "link",
      status: "processing",
    });

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.filter((job) => job.name === "ai:processItem")).toHaveLength(1);
  });

  it("is idempotent: a repeat — even with a different URL — returns the same item and never re-schedules processing", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    const first = await t.mutation(api.demo.createDemoItem, { url: URL });
    const second = await t.mutation(api.demo.createDemoItem, {
      url: "https://example.com/other",
      // A different destination on the repeat must not silently move the save.
      spaceName: "Recipes",
    });

    expect(second.itemId).toBe(first.itemId);
    expect(second.reused).toBe(true);

    // Client honesty: the original save — original URL and its real current
    // destinations — is what comes back, never the newly typed input.
    const item = await t.query(api.items.getItem, { id: second.itemId });
    expect(item?.url).toBe(URL);
    expect(second.savedSpaceNames).toEqual([]);

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.filter((job) => job.name === "ai:processItem")).toHaveLength(1);
  });

  it("rejects an unauthenticated caller — no allowance without an identity", async () => {
    const backend = newConvexTest();
    await expect(
      backend.mutation(api.demo.createDemoItem, { url: URL }),
    ).rejects.toThrow();
    await expect(
      backend.mutation(api.demo.retryDemoItem, {}),
    ).rejects.toThrow();
    await backend.run(async (ctx) => {
      const demos = await ctx.db.query("onboardingDemos").collect();
      expect(demos).toHaveLength(0);
    });
  });

  it("is tied to the authenticated identity — two users on the same database each get their own allowance", async () => {
    const backend = newConvexTest();
    const a = await asUser(backend, "demo-a");
    const b = await asUser(backend, "demo-b");
    const first = await a.mutation(api.demo.createDemoItem, { url: URL });

    // User B still has their own allowance; A's row is never returned to B.
    const second = await b.mutation(api.demo.createDemoItem, { url: URL });
    expect(second.itemId).not.toBe(first.itemId);
    expect(second.reused).toBe(false);

    const item = await b.query(api.items.getItem, { id: first.itemId });
    expect(item).toBeNull();
  });

  it("does not require Pro — the scoped allowance is the point", async () => {
    const t = await asUser(newConvexTest(), "free-user", { pro: false });
    const { reused } = await t.mutation(api.demo.createDemoItem, { url: URL });
    expect(reused).toBe(false);
  });

  it("keeps normal Pro gating intact: createLinkItem still throws for the same free user", async () => {
    const backend = newConvexTest();
    const t = await asUser(backend, "free-user", { pro: false });
    await t.mutation(api.demo.createDemoItem, { url: URL });
    await expect(
      t.mutation(api.items.createLinkItem, { url: "https://example.com" }),
    ).rejects.toThrow("Pro required");
  });

  it("files the demo item into the ONE explicitly chosen destination as a saved membership, creating the space (dynamic)", async () => {
    const t = await asUser(newConvexTest(), "spaces-user");
    const { itemId, savedSpaceNames } = await t.mutation(
      api.demo.createDemoItem,
      { url: URL, spaceName: "  Travel  " },
    );
    expect(savedSpaceNames).toEqual(["Travel"]);

    await t.run(async (ctx) => {
      const spaces = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "spaces-user"))
        .collect();
      expect(spaces).toHaveLength(1);
      expect(spaces[0]).toMatchObject({ name: "Travel", dynamic: true });
      const joins = await ctx.db
        .query("spaceItems")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect();
      expect(joins).toHaveLength(1);
      expect(joins.every((j) => j.status === "saved")).toBe(true);
    });

    // Replay safety: the same destination (whitespace differences included)
    // reuses the existing space instead of creating a duplicate.
    const again = await t.mutation(api.demo.createDemoItem, {
      url: URL,
      spaceName: "Travel",
    });
    expect(again.reused).toBe(true);
    expect(again.savedSpaceNames).toEqual(["Travel"]);
    await t.run(async (ctx) => {
      const spaces = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "spaces-user"))
        .collect();
      expect(spaces).toHaveLength(1);
    });
  });

  it("defaults to just the shelf when no destination is chosen", async () => {
    const t = await asUser(newConvexTest(), "spaces-user");
    const { savedSpaceNames } = await t.mutation(api.demo.createDemoItem, {
      url: URL,
    });
    expect(savedSpaceNames).toEqual([]);
    await t.run(async (ctx) => {
      const spaces = await ctx.db
        .query("spaces")
        .withIndex("by_user", (q) => q.eq("userId", "spaces-user"))
        .collect();
      expect(spaces).toHaveLength(0);
    });
  });

  it("rejects an invalid destination without consuming the allowance", async () => {
    const t = await asUser(newConvexTest(), "spaces-user");
    await expect(
      t.mutation(api.demo.createDemoItem, { url: URL, spaceName: "   " }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.demo.createDemoItem, {
        url: URL,
        spaceName: "x".repeat(61),
      }),
    ).rejects.toThrow();
    // Nothing was written — no item, no space, no demo row.
    await t.run(async (ctx) => {
      const demos = await ctx.db.query("onboardingDemos").collect();
      expect(demos).toHaveLength(0);
      const items = await ctx.db.query("items").collect();
      expect(items).toHaveLength(0);
      const spaces = await ctx.db.query("spaces").collect();
      expect(spaces).toHaveLength(0);
    });
  });

  it("rejects a spent allowance whose demo item was deleted", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, { url: URL });
    await t.mutation(api.items.deleteItem, { id: itemId });
    await expect(
      t.mutation(api.demo.createDemoItem, { url: URL }),
    ).rejects.toThrow(DEMO_USED);
  });

  it("enforces the same URL policy as regular saves", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    await expect(
      t.mutation(api.demo.createDemoItem, { url: "ftp://example.com/file" }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.demo.createDemoItem, { url: "" }),
    ).rejects.toThrow();
  });

  it("records save telemetry without the URL", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, {
      url: URL,
      analyticsSessionId: "demo-session",
    });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const telemetry = jobs.filter((job) => job.name === "analytics:captureSave");
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].args[0]).toMatchObject({
      itemId,
      userId: "demo-user",
      itemType: "link",
      sessionId: "demo-session",
    });
    expect(JSON.stringify(telemetry[0].args[0])).not.toContain("bbcgoodfood");
  });
});

describe("retryDemoItem", () => {
  it("re-runs the pipeline on the SAME failed demo item — no second item, no second allowance", async () => {
    const t = await asUser(newConvexTest(), "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, { url: URL });
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "failed", failureReason: "error" });
    });

    const retry = await t.mutation(api.demo.retryDemoItem, {});
    expect(retry.scheduled).toBe(true);

    const item = await t.run(async (ctx) => await ctx.db.get(itemId));
    expect(item?.status).toBe("processing");

    await t.run(async (ctx) => {
      const items = await ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", "demo-user"))
        .collect();
      expect(items).toHaveLength(1);
    });
  });

  it("does not double-schedule while processing, and does nothing for a ready item", async () => {
    const backend = newConvexTest();
    const t = await asUser(backend, "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, { url: URL });

    await backend.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "processing" });
    });
    const whileProcessing = await t.mutation(api.demo.retryDemoItem, {});
    expect(whileProcessing.scheduled).toBe(false);

    await backend.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "ready", title: "Filed" });
    });
    const whenReady = await t.mutation(api.demo.retryDemoItem, {});
    expect(whenReady.scheduled).toBe(false);
  });

  it("requires the caller to own a demo and is unavailable without one", async () => {
    const t = await asUser(newConvexTest(), "no-demo-user");
    await expect(t.mutation(api.demo.retryDemoItem, {})).rejects.toThrow(
      "No demo save",
    );
  });

  it("is rate limited so a broken page cannot loop classifications", async () => {
    const backend = newConvexTest();
    const t = await asUser(backend, "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, { url: URL });

    // Exhaust the bounded retry bucket (capacity 3), then the next attempt throws.
    for (let i = 0; i < 3; i++) {
      await backend.run(async (ctx) => {
        await ctx.db.patch(itemId, { status: "failed" });
      });
      const retry = await t.mutation(api.demo.retryDemoItem, {});
      expect(retry.scheduled).toBe(true);
    }
    await backend.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "failed" });
    });
    await expect(t.mutation(api.demo.retryDemoItem, {})).rejects.toThrow(
      /demoRetry|RateLimited/i,
    );
  });

  it("enforces the persistent retry cap even across rate-limit windows", async () => {
    const backend = newConvexTest();
    const t = await asUser(backend, "demo-user");
    const { itemId } = await t.mutation(api.demo.createDemoItem, { url: URL });
    await backend.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "failed" });
      const demo = await ctx.db
        .query("onboardingDemos")
        .withIndex("by_user", (q) => q.eq("userId", "demo-user"))
        .unique();
      await ctx.db.patch(demo!._id, { retryCount: MAX_DEMO_RETRIES });
    });
    await expect(t.mutation(api.demo.retryDemoItem, {})).rejects.toThrow(
      "Too many retries",
    );
    await backend.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      expect(jobs.filter((job) => job.name === "ai:processItem")).toHaveLength(
        1,
      );
    });
  });
});
