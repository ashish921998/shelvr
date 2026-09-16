// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { rateLimiter } from "./model/rateLimiter";
import {
  bearerToken,
  CONNECTION_TOKEN_PREFIX,
  DEFAULT_CONNECTION_LABEL,
  formatPairingCode,
  generateConnectionToken,
  generatePairingCode,
  hashSecret,
  MAX_CONNECTION_LABEL_LENGTH,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  sanitizeConnectionLabel,
} from "./model/extensionAuth";

/** The backend `newConvexTest()` hands back: it can still call `withIdentity`
 * and `fetch`. `TestCtx` is what `withIdentity` narrows to — an
 * identity-scoped accessor — matching the convention in items.test.ts. */
type TestBackend = ReturnType<typeof newConvexTest>;
type TestCtx = TestConvexForDataModel<DataModel>;

// The save path schedules `internal.ai.processItem` through a real setTimeout;
// letting it fire would run the classifier during worker teardown. Queue the
// jobs instead — the `_scheduled_functions` rows are still written. Date stays
// real, because pairing expiry is judged against it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A real users row plus the identity the app would sign in with. Convex Auth
 * puts `userId|sessionId` in the JWT subject; `requireUserId` strips the
 * session half, and the id has to be a genuine document id because
 * `storePairingCode` validates it as one. */
async function seedUser(
  t: TestBackend,
  email: string,
): Promise<{ userId: Id<"users">; identity: TestCtx }> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email });
  });
  return {
    userId,
    identity: t.withIdentity({ subject: `${userId}|session-1` }),
  };
}

async function seedPro(t: TestBackend, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
  });
}

/** Mint a code in the app and redeem it the way the extension does, returning
 * the bearer token. The whole pairing handshake in one call, so the tests
 * below can be about what happens after it. */
async function pair(
  t: TestBackend,
  identity: TestCtx,
  label = "Chrome on macOS",
): Promise<string> {
  const { code } = await identity.action(api.extension.createPairingCode, {});
  const response = await t.fetch("/extension/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, label }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { token: string };
  return body.token;
}

/** Empty the global redemption bucket the way a grinder would, without
 * actually sending a hundred requests. */
async function drainRedeemBudget(t: TestBackend): Promise<void> {
  await t.run(async (ctx) => {
    const { ok } = await rateLimiter.limit(ctx, "extensionPairRedeem", {
      count: 100,
    });
    expect(ok).toBe(true);
  });
}

function save(
  t: TestBackend,
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return t.fetch("/extension/save", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("pairing code format", () => {
  it("draws every character from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      for (const char of code) {
        expect(PAIRING_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("does not collide across a run of codes", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generatePairingCode()),
    );
    expect(codes.size).toBe(500);
  });

  it("splits the displayed code into two groups", () => {
    expect(formatPairingCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("accepts the code back however the user retypes it", () => {
    for (const typed of [
      "ABCD-2345",
      "abcd2345",
      " abcd 2345 ",
      "ABCD_2345",
      "abcd-2345\n",
    ]) {
      expect(normalizePairingCode(typed)).toBe("ABCD2345");
    }
  });

  it("folds the excluded lookalikes onto the symbol they resemble", () => {
    // I, L and O are not in the alphabet at all, so someone reading 1 as I or
    // 0 as O still pairs on the first try.
    expect(normalizePairingCode("I23456O8")).toBe("12345608");
    expect(normalizePairingCode("L2345678")).toBe("12345678");
  });

  it("rejects anything that cannot be a code", () => {
    expect(normalizePairingCode("ABCD234")).toBeNull();
    expect(normalizePairingCode("ABCD23456")).toBeNull();
    expect(normalizePairingCode("")).toBeNull();
    expect(normalizePairingCode("!!!!!!!!")).toBeNull();
    expect(normalizePairingCode(undefined)).toBeNull();
    expect(normalizePairingCode(12345678)).toBeNull();
  });
});

describe("connection tokens", () => {
  it("mints prefixed, non-repeating, URL-safe tokens", () => {
    const tokens = Array.from({ length: 200 }, () => generateConnectionToken());
    expect(new Set(tokens).size).toBe(200);
    for (const token of tokens) {
      expect(token.startsWith(CONNECTION_TOKEN_PREFIX)).toBe(true);
      expect(token.slice(CONNECTION_TOKEN_PREFIX.length)).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );
    }
  });

  it("hashes to a stable 64-character digest", async () => {
    const first = await hashSecret("shx_example");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSecret("shx_example")).toBe(first);
    expect(await hashSecret("shx_exampld")).not.toBe(first);
  });

  it("reads a bearer credential out of the header, or nothing", () => {
    expect(bearerToken("Bearer shx_abc")).toBe("shx_abc");
    expect(bearerToken("bearer shx_abc")).toBe("shx_abc");
    expect(bearerToken("Basic shx_abc")).toBeNull();
    expect(bearerToken("shx_abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("connection labels", () => {
  it("keeps a normal label as written", () => {
    expect(sanitizeConnectionLabel("Chrome on macOS")).toBe("Chrome on macOS");
  });

  it("collapses whitespace and strips control characters", () => {
    expect(sanitizeConnectionLabel("Chrome\u0000\n  on   macOS")).toBe(
      "Chrome on macOS",
    );
  });

  it("bounds the length so one row cannot flood the list", () => {
    const label = sanitizeConnectionLabel("x".repeat(500));
    expect(label).toHaveLength(MAX_CONNECTION_LABEL_LENGTH);
  });

  it("truncates by code point, so an emoji is never cut in half", () => {
    // Convex stores strings as valid Unicode and rejects a lone surrogate, so
    // a UTF-16 `slice` landing between the halves of an emoji would fail the
    // insert rather than shorten the label.
    const label = sanitizeConnectionLabel(
      `${"x".repeat(MAX_CONNECTION_LABEL_LENGTH - 1)}\u{1F600}tail`,
    );
    expect(label.isWellFormed()).toBe(true);
    expect([...label]).toHaveLength(MAX_CONNECTION_LABEL_LENGTH);
    expect(label.endsWith("\u{1F600}")).toBe(true);
  });

  it("falls back for missing or empty labels", () => {
    expect(sanitizeConnectionLabel("   ")).toBe(DEFAULT_CONNECTION_LABEL);
    expect(sanitizeConnectionLabel(undefined)).toBe(DEFAULT_CONNECTION_LABEL);
    expect(sanitizeConnectionLabel(42)).toBe(DEFAULT_CONNECTION_LABEL);
  });
});

describe("POST /extension/pair", () => {
  it("trades a code for a token and records the browser", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");

    const token = await pair(t, identity, "Chrome on macOS");
    expect(token.startsWith(CONNECTION_TOKEN_PREFIX)).toBe(true);

    const connections = await identity.query(api.extension.listConnections, {});
    expect(connections).toHaveLength(1);
    expect(connections[0]!.label).toBe("Chrome on macOS");
    expect(connections[0]!.lastUsedAt).toBeUndefined();

    // Only the hash is kept: the token itself is unrecoverable from the row.
    const stored = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("extensionConnections")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return rows[0]!;
    });
    expect(stored.tokenHash).toBe(await hashSecret(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("consumes the code, so the same one cannot pair a second browser", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    const { code } = await identity.action(api.extension.createPairingCode, {});

    const first = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, label: "Chrome" }),
    });
    expect(first.status).toBe(200);

    const replay = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, label: "Somebody else's browser" }),
    });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "invalid_code" });

    expect(
      await identity.query(api.extension.listConnections, {}),
    ).toHaveLength(1);
  });

  it("refuses an expired code and consumes it", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    const { code } = await identity.action(api.extension.createPairingCode, {});
    await t.run(async (ctx) => {
      const pairing = await ctx.db
        .query("extensionPairings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      await ctx.db.patch(pairing!._id, { expiresAt: Date.now() - 1 });
    });

    const response = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(response.status).toBe(401);
    expect(await identity.query(api.extension.listConnections, {})).toEqual([]);
    const remaining = await t.run(async (ctx) =>
      ctx.db.query("extensionPairings").collect(),
    );
    expect(remaining).toEqual([]);
  });

  it("caps guessing once the global budget is spent", async () => {
    const t = newConvexTest();
    // Spend the global burst without sending a hundred requests. The caller is
    // anonymous at this point, so there is no per-user bucket to fall back on.
    await drainRedeemBudget(t);

    const response = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ-ZZZZ" }),
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("still pairs a real code while a grinder holds the budget empty", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    const { code } = await identity.action(api.extension.createPairingCode, {});
    await drainRedeemBudget(t);

    // The bucket is charged only on a miss, so one caller burning it cannot
    // lock everyone else out of pairing — which a shared bucket charged on
    // every attempt would let them do.
    const response = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, label: "Chrome on macOS" }),
    });
    expect(response.status).toBe(200);
    expect(
      await identity.query(api.extension.listConnections, {}),
    ).toHaveLength(1);
  });

  it("does not consume a real code when the budget is spent", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    await identity.action(api.extension.createPairingCode, {});
    await drainRedeemBudget(t);

    await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ-ZZZZ" }),
    });

    const survivors = await t.run(async (ctx) =>
      ctx.db.query("extensionPairings").collect(),
    );
    expect(survivors).toHaveLength(1);
  });

  it("answers an unknown code the same way as an expired one", async () => {
    const t = newConvexTest();
    const response = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZ-ZZZZ" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_code" });
  });

  it("rejects a malformed code and an unreadable body", async () => {
    const t = newConvexTest();
    const malformed = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "nope" }),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "invalid_code" });

    const unreadable = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(unreadable.status).toBe(400);
  });

  it("names an unlabelled browser rather than leaving the row blank", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    await pair(t, identity, "   ");
    const connections = await identity.query(api.extension.listConnections, {});
    expect(connections[0]!.label).toBe(DEFAULT_CONNECTION_LABEL);
  });

  it("replaces the outstanding code when the app asks for a new one", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    const first = await identity.action(api.extension.createPairingCode, {});
    const second = await identity.action(api.extension.createPairingCode, {});
    expect(second.code).not.toBe(first.code);

    const live = await t.run(async (ctx) =>
      ctx.db
        .query("extensionPairings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(live).toHaveLength(1);

    const stale = await t.fetch("/extension/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: first.code }),
    });
    expect(stale.status).toBe(401);
  });
});

describe("GET /extension/session", () => {
  it("reports the account the browser is attached to", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    const token = await pair(t, identity, "Firefox on Linux");

    const response = await t.fetch("/extension/session", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      label: "Firefox on Linux",
      email: "owner@example.com",
    });
  });

  it("rejects a missing or unknown token", async () => {
    const t = newConvexTest();
    expect((await t.fetch("/extension/session")).status).toBe(401);
    const unknown = await t.fetch("/extension/session", {
      headers: { authorization: "Bearer shx_not-a-real-token" },
    });
    expect(unknown.status).toBe(401);
  });
});

describe("POST /extension/save", () => {
  it("saves the page through the same pipeline as an in-app save", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    const response = await save(t, token, {
      url: "example.com/article?utm=1",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; itemId: string };
    expect(body.status).toBe("saved");

    const item = await t.run(async (ctx) =>
      ctx.db.get(body.itemId as Id<"items">),
    );
    expect(item).toMatchObject({
      userId,
      type: "link",
      status: "processing",
      // The URL policy ran: a schemeless host came back canonical.
      url: "https://example.com/article?utm=1",
    });

    // The classifier is scheduled exactly as it is for an app save.
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.filter((job) => job.name.includes("processItem")),
    ).toHaveLength(1);
  });

  it("reports a page already in the library instead of saving it twice", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    const first = (await (
      await save(t, token, { url: "https://example.com/a" })
    ).json()) as { status: string; itemId: string };
    const second = (await (
      await save(t, token, { url: "https://example.com/a" })
    ).json()) as { status: string; itemId: string };

    expect(first.status).toBe("saved");
    expect(second.status).toBe("duplicate");
    expect(second.itemId).toBe(first.itemId);

    const items = await t.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(items).toHaveLength(1);
  });

  it("returns one item for a retried save that reuses its operation id", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);
    const operationId = "ext:11111111-1111-4111-8111-111111111111";

    const first = (await (
      await save(t, token, { url: "https://example.com/b", operationId })
    ).json()) as { itemId: string };
    const retry = (await (
      await save(t, token, { url: "https://example.com/b", operationId })
    ).json()) as { itemId: string };

    expect(retry.itemId).toBe(first.itemId);
  });

  it("marks the connection used once a save lands", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    await save(t, token, { url: "https://example.com/c" });
    const connections = await identity.query(api.extension.listConnections, {});
    expect(connections[0]!.lastUsedAt).toBeGreaterThan(0);
  });

  it("refuses a URL the policy would refuse in the app", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    const response = await save(t, token, { url: "chrome://settings" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_url",
      reason: "unsupported_scheme",
    });
  });

  it("rejects a body without a URL and a malformed operation id", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    expect((await save(t, token, {})).status).toBe(400);
    expect(
      (await save(t, token, { url: "https://example.com/d", operationId: "x" }))
        .status,
    ).toBe(400);
  });

  it("answers 402 when the account has no active subscription", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    const token = await pair(t, identity);

    const response = await save(t, token, { url: "https://example.com/e" });
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "pro_required" });

    const items = await t.run(async (ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(items).toEqual([]);
  });

  it("rejects a missing, malformed or revoked token", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    const anonymous = await t.fetch("/extension/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/f" }),
    });
    expect(anonymous.status).toBe(401);
    expect(
      (await save(t, "shx_wrong", { url: "https://example.com/f" })).status,
    ).toBe(401);

    const [connection] = await identity.query(
      api.extension.listConnections,
      {},
    );
    await identity.mutation(api.extension.revokeConnection, {
      connectionId: connection!.id,
    });
    expect(
      (await save(t, token, { url: "https://example.com/f" })).status,
    ).toBe(401);
  });

  it("stops charging the account once its create budget is spent", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);

    // itemCreate allows a burst of 30; the 31st distinct URL is refused.
    let limited: Response | undefined;
    for (let i = 0; i < 40; i++) {
      const response = await save(t, token, {
        url: `https://example.com/burst-${i}`,
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    expect(limited).toBeDefined();
    expect(await limited!.json()).toEqual({ error: "rate_limited" });
    expect(Number(limited!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("POST /extension/disconnect", () => {
  it("drops only the connection whose token was presented", async () => {
    const t = newConvexTest();
    const { identity } = await seedUser(t, "owner@example.com");
    const laptop = await pair(t, identity, "Chrome on macOS");
    const desktop = await pair(t, identity, "Chrome on Windows");

    const response = await t.fetch("/extension/disconnect", {
      method: "POST",
      headers: { authorization: `Bearer ${laptop}` },
    });
    expect(response.status).toBe(200);

    const connections = await identity.query(api.extension.listConnections, {});
    expect(connections.map((c) => c.label)).toEqual(["Chrome on Windows"]);
    expect(
      (
        await t.fetch("/extension/session", {
          headers: { authorization: `Bearer ${desktop}` },
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a request with no token", async () => {
    const t = newConvexTest();
    const response = await t.fetch("/extension/disconnect", { method: "POST" });
    expect(response.status).toBe(401);
  });
});

describe("cross-origin access", () => {
  it("allows an extension page and ignores an ordinary web origin", async () => {
    const t = newConvexTest();
    const allowed = await t.fetch("/extension/save", {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://abcdefghijklmnop" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://abcdefghijklmnop",
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBeNull();

    const web = await t.fetch("/extension/save", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    expect(web.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("connection management", () => {
  it("shows a user only their own browsers", async () => {
    const t = newConvexTest();
    const owner = await seedUser(t, "owner@example.com");
    const stranger = await seedUser(t, "stranger@example.com");
    await pair(t, owner.identity, "Owner's Chrome");
    await pair(t, stranger.identity, "Stranger's Chrome");

    expect(
      (await owner.identity.query(api.extension.listConnections, {})).map(
        (c) => c.label,
      ),
    ).toEqual(["Owner's Chrome"]);
  });

  it("will not let a stranger revoke someone else's browser", async () => {
    const t = newConvexTest();
    const owner = await seedUser(t, "owner@example.com");
    const stranger = await seedUser(t, "stranger@example.com");
    const token = await pair(t, owner.identity);
    const [connection] = await owner.identity.query(
      api.extension.listConnections,
      {},
    );

    await stranger.identity.mutation(api.extension.revokeConnection, {
      connectionId: connection!.id,
    });

    expect(
      (
        await t.fetch("/extension/session", {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(200);
  });

  it("requires a signed-in caller", async () => {
    const t = newConvexTest();
    await expect(
      t.action(api.extension.createPairingCode, {}),
    ).rejects.toThrow();
    await expect(t.query(api.extension.listConnections, {})).rejects.toThrow();
  });
});

describe("pairing code cleanup", () => {
  it("sweeps expired codes and leaves live ones alone", async () => {
    const t = newConvexTest();
    const live = await seedUser(t, "live@example.com");
    const stale = await seedUser(t, "stale@example.com");
    await live.identity.action(api.extension.createPairingCode, {});
    await stale.identity.action(api.extension.createPairingCode, {});
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("extensionPairings")
        .withIndex("by_user", (q) => q.eq("userId", stale.userId))
        .first();
      await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
    });

    await t.mutation(internal.extension.cleanupExpiredPairings, {});

    const remaining = await t.run(async (ctx) =>
      ctx.db.query("extensionPairings").collect(),
    );
    expect(remaining.map((row) => row.userId)).toEqual([live.userId]);
  });
});

describe("account deletion", () => {
  it("revokes every paired browser before the saves are drained", async () => {
    const t = newConvexTest();
    const { userId, identity } = await seedUser(t, "owner@example.com");
    await seedPro(t, userId);
    const token = await pair(t, identity);
    await identity.action(api.extension.createPairingCode, {});

    await identity.mutation(api.users.deleteCurrentUserAccount, {});

    expect(
      (await save(t, token, { url: "https://example.com/after" })).status,
    ).toBe(401);
    const leftovers = await t.run(async (ctx) => ({
      connections: await ctx.db.query("extensionConnections").collect(),
      pairings: await ctx.db.query("extensionPairings").collect(),
    }));
    expect(leftovers).toEqual({ connections: [], pairings: [] });
  });
});
