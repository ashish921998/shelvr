// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { X_SYNC_INTERVAL_MS } from "./xImport";
import { bookmarkPostUrl, pkceChallenge } from "./model/xApi";

type TestCtx = TestConvexForDataModel<DataModel>;

// Keep scheduled jobs queued (see items.test.ts): the rows stay assertable
// without the AI action or a sync firing during teardown.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubEnv("X_CLIENT_ID", "client-id");
  vi.stubEnv("X_CLIENT_SECRET", "client-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup(options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const userId = await base.run((ctx) => ctx.db.insert("users", {}));
  const t = base.withIdentity({ subject: `${userId}|session-1` });
  if (options.pro !== false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    });
  }
  return { t, userId };
}

async function insertConnection(
  t: TestCtx,
  userId: Id<"users">,
  overrides: Partial<{
    backfillComplete: boolean;
    accessTokenExpiresAt: number;
    nextSyncAt: number;
    lastSyncedAt: number;
  }> = {},
): Promise<Id<"xConnections">> {
  return await t.run((ctx) =>
    ctx.db.insert("xConnections", {
      userId,
      xUserId: "42",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      status: "active",
      connectedAt: Date.now(),
      backfillComplete: false,
      nextSyncAt: Date.now() + X_SYNC_INTERVAL_MS,
      importedCount: 0,
      ...overrides,
    }),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes stubbed X API calls by URL. Unrouted calls fail the test loudly. */
function stubX(routes: {
  token?: () => Response;
  me?: () => Response;
  bookmarks?: (url: URL) => Response;
  revoke?: () => Response;
}) {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    if (url.pathname === "/2/oauth2/token" && routes.token)
      return routes.token();
    if (url.pathname === "/2/users/me" && routes.me) return routes.me();
    if (url.pathname.endsWith("/bookmarks") && routes.bookmarks) {
      return routes.bookmarks(url);
    }
    if (url.pathname === "/2/oauth2/revoke" && routes.revoke) {
      return routes.revoke();
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

/** A bookmarks endpoint serving `ids` newest first in pages of max_results. */
function bookmarksOf(ids: string[]) {
  return (url: URL) => {
    const size = Number(url.searchParams.get("max_results"));
    const start = Number(url.searchParams.get("pagination_token") ?? "0");
    const page = ids.slice(start, start + size);
    const next = start + size < ids.length ? String(start + size) : undefined;
    return json({
      ...(page.length > 0 ? { data: page.map((id) => ({ id })) } : {}),
      meta: { result_count: page.length, next_token: next },
    });
  };
}

async function itemUrls(t: TestCtx, userId: Id<"users">) {
  const items = await t.run((ctx) =>
    ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
  return items.map((item) => item.url);
}

async function connection(t: TestCtx, id: Id<"xConnections">) {
  return await t.run((ctx) => ctx.db.get(id));
}

describe("getXConnection", () => {
  it("hides X import until the app credentials are set", async () => {
    vi.stubEnv("X_CLIENT_SECRET", "");
    const { t } = await setup();
    expect(await t.query(api.xImport.getXConnection, {})).toEqual({
      available: false,
      connection: null,
    });
  });

  it("reports the caller's connection", async () => {
    const { t, userId } = await setup();
    await insertConnection(t, userId);
    const state = await t.query(api.xImport.getXConnection, {});
    expect(state.available).toBe(true);
    expect(state.connection).toMatchObject({
      status: "active",
      importedCount: 0,
      lastSyncedAt: null,
    });
  });
});

describe("connecting X", () => {
  it("needs Pro", async () => {
    const { t } = await setup({ pro: false });
    await expect(t.mutation(api.xImport.startXConnect, {})).rejects.toThrow();
  });

  it("builds a PKCE consent URL and keeps one pending handshake", async () => {
    const { t } = await setup();
    await t.mutation(api.xImport.startXConnect, {});
    const { url } = await t.mutation(api.xImport.startXConnect, {});
    const consent = new URL(url);
    expect(consent.origin + consent.pathname).toBe(
      "https://x.com/i/oauth2/authorize",
    );
    expect(consent.searchParams.get("redirect_uri")).toBe(
      "https://example.convex.site/x/oauth/callback",
    );
    expect(consent.searchParams.get("scope")).toBe(
      "tweet.read users.read bookmark.read offline.access",
    );
    const states = await t.run((ctx) => ctx.db.query("xOAuthStates").collect());
    expect(states).toHaveLength(1);
    expect(states[0].state).toBe(consent.searchParams.get("state"));
    expect(consent.searchParams.get("code_challenge")).toBe(
      await pkceChallenge(states[0].codeVerifier),
    );
  });

  it("exchanges the code, stores the account, and starts a sync", async () => {
    const { t, userId } = await setup();
    const { url } = await t.mutation(api.xImport.startXConnect, {});
    const state = new URL(url).searchParams.get("state")!;
    stubX({
      token: () =>
        json({ access_token: "a", refresh_token: "r", expires_in: 7200 }),
      me: () => json({ data: { id: "42", username: "someone" } }),
    });
    const res = await t.fetch(
      `/x/oauth/callback?state=${state}&code=the-code`,
      { method: "GET" },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("shelvr://import?x=connected");
    const rows = await t.run((ctx) => ctx.db.query("xConnections").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId,
      xUserId: "42",
      accessToken: "a",
      refreshToken: "r",
      status: "active",
      backfillComplete: false,
    });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.map((job) => job.name)).toContain("xImport:syncBookmarks");
    // The handshake is single use.
    expect(
      await t.run((ctx) => ctx.db.query("xOAuthStates").collect()),
    ).toHaveLength(0);
  });

  it("sends the browser back with a failure for an unknown state", async () => {
    const { t } = await setup();
    stubX({});
    const res = await t.fetch("/x/oauth/callback?state=nope&code=c", {
      method: "GET",
    });
    expect(res.headers.get("location")).toBe("shelvr://import?x=failed");
  });
});

describe("syncBookmarks", () => {
  it("backfills every page, then records the backfill as done", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId);
    const ids = Array.from({ length: 60 }, (_, i) => String(1000 - i));
    stubX({ bookmarks: bookmarksOf(ids) });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(await itemUrls(t, userId)).toHaveLength(60);
    const row = await connection(t, id);
    expect(row).toMatchObject({ backfillComplete: true, importedCount: 60 });
    expect(row?.lastSyncedAt).toBeTypeOf("number");
  });

  it("stops at the first page it has seen once the backfill is done", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId, { backfillComplete: true });
    await t.run(async (ctx) => {
      for (const postId of ["90", "80"]) {
        await ctx.db.insert("xImportedPosts", { userId, postId });
      }
    });
    const calls = stubX({ bookmarks: bookmarksOf(["100", "95", "90", "80"]) });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(await itemUrls(t, userId)).toEqual([
      bookmarkPostUrl("100"),
      bookmarkPostUrl("95"),
    ]);
    expect(calls).toHaveLength(1);
  });

  it("never brings back a save the user deleted", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId);
    stubX({ bookmarks: bookmarksOf(["7"]) });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    await t.run(async (ctx) => {
      for (const item of await ctx.db.query("items").collect()) {
        await ctx.db.delete(item._id);
      }
    });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(await itemUrls(t, userId)).toEqual([]);
  });

  it("refreshes an expiring token and stores the rotated pair", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId, {
      accessTokenExpiresAt: Date.now() - 1,
    });
    stubX({
      token: () =>
        json({ access_token: "a2", refresh_token: "r2", expires_in: 7200 }),
      bookmarks: bookmarksOf([]),
    });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(await connection(t, id)).toMatchObject({
      accessToken: "a2",
      refreshToken: "r2",
      status: "active",
    });
  });

  it("asks the user to reconnect when X rejects the refresh token", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId, {
      accessTokenExpiresAt: Date.now() - 1,
    });
    stubX({ token: () => json({ error: "invalid_request" }, 400) });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(await connection(t, id)).toMatchObject({ status: "reconnect" });
  });

  it("spends nothing on X once the user has no Pro", async () => {
    const { t, userId } = await setup({ pro: false });
    const id = await insertConnection(t, userId);
    const calls = stubX({ bookmarks: bookmarksOf(["1"]) });
    await t.action(internal.xImport.syncBookmarks, { connectionId: id });
    expect(calls).toHaveLength(0);
  });
});

describe("syncDueConnections", () => {
  it("schedules due accounts and claims them", async () => {
    const { t, userId } = await setup();
    const id = await insertConnection(t, userId, {
      nextSyncAt: Date.now() - 1,
    });
    await t.mutation(internal.xImport.syncDueConnections, {});
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      jobs.filter((job) => job.name === "xImport:syncBookmarks"),
    ).toHaveLength(1);
    expect((await connection(t, id))!.nextSyncAt).toBeGreaterThan(Date.now());
    await t.mutation(internal.xImport.syncDueConnections, {});
    const again = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      again.filter((job) => job.name === "xImport:syncBookmarks"),
    ).toHaveLength(1);
  });
});

describe("syncXNow and disconnectX", () => {
  it("refuses a manual sync moments after the last one", async () => {
    const { t, userId } = await setup();
    await insertConnection(t, userId, { lastSyncedAt: Date.now() });
    expect(await t.mutation(api.xImport.syncXNow, {})).toBe(false);
  });

  it("disconnects but remembers which posts were handled", async () => {
    const { t, userId } = await setup();
    await insertConnection(t, userId);
    await t.run((ctx) =>
      ctx.db.insert("xImportedPosts", { userId, postId: "1" }),
    );
    await t.mutation(api.xImport.disconnectX, {});
    expect(
      await t.run((ctx) => ctx.db.query("xConnections").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("xImportedPosts").collect()),
    ).toHaveLength(1);
  });

  it("drains X data with the account", async () => {
    const { t, userId } = await setup();
    await insertConnection(t, userId);
    await t.run((ctx) =>
      ctx.db.insert("xImportedPosts", { userId, postId: "1" }),
    );
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    expect(
      await t.run((ctx) => ctx.db.query("xConnections").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("xImportedPosts").collect()),
    ).toHaveLength(0);
  });
});
