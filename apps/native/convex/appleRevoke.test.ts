// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppleProfile } from "@auth/core/providers/apple";
import { api, internal } from "./_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Id } from "./_generated/dataModel";
import { normalizeAppleProfile } from "./appleProfile";
import { newConvexTest } from "./test.setup";

type Backend = ReturnType<typeof newConvexTest>;
type T = TestConvexForDataModel<DataModel>;

const fetchMock = vi.fn();

function base64Url(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(text.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}

async function signingKey() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const body = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return {
    publicKey: pair.publicKey,
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
  };
}

async function configure() {
  const key = await signingKey();
  vi.stubEnv("AUTH_APPLE_ID", "app.shelvr.signin");
  vi.stubEnv("APPLE_REVOKE_PRIVATE_KEY", key.pem);
  vi.stubEnv("APPLE_REVOKE_KEY_ID", "KEY123");
  vi.stubEnv("APPLE_REVOKE_TEAM_ID", "TEAM456");
  return key;
}

async function scheduledRevokes(t: T) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => job.name === "appleRevoke:revoke");
}

async function appleUser(t: T, refreshToken?: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@example.com" });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "apple",
      providerAccountId: "apple-sub-1",
    });
    if (refreshToken !== undefined) {
      await ctx.db.insert("appleTokens", {
        userId,
        refreshToken,
        updatedAt: Date.now(),
      });
    }
    return userId;
  });
}

async function tokenRow(t: Backend) {
  const userId = await appleUser(t as T, "r.token");
  const row = await t.run((ctx) => ctx.db.query("appleTokens").first());
  return { userId, tokenId: row!._id };
}

async function tokenRows(t: Backend) {
  return await t.run((ctx) => ctx.db.query("appleTokens").collect());
}

function as(t: Backend, userId: Id<"users">): T {
  return t.withIdentity({ subject: `${userId}|session-1` });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("capturing Apple's refresh token at sign-in", () => {
  const profile: AppleProfile = {
    iss: "https://appleid.apple.com",
    aud: "app.shelvr.signin",
    iat: 1,
    exp: 2,
    sub: "apple-sub-1",
    nonce: "nonce",
    nonce_supported: true,
    email: "a@example.com",
    email_verified: true,
    is_private_email: false,
    real_user_status: 2,
    transfer_sub: "",
    at_hash: "hash",
    auth_time: 1,
  };

  it("carries the token out of the provider's token response", () => {
    expect(
      normalizeAppleProfile(profile, { refresh_token: "r.token" }),
    ).toMatchObject({ id: "apple-sub-1", appleRefreshToken: "r.token" });
    expect(normalizeAppleProfile(profile, {})).not.toHaveProperty(
      "appleRefreshToken",
    );
  });

  async function signIn(t: T, refreshToken: string) {
    vi.stubEnv("AUTH_APPLE_ID", "app.shelvr.signin");
    vi.stubEnv("AUTH_APPLE_SECRET", "unit-test-only");
    await t.run((ctx) =>
      ctx.db.insert("authVerifiers", { signature: `sig-${refreshToken}` }),
    );
    const { id, ...rest } = normalizeAppleProfile(profile, {
      refresh_token: refreshToken,
    });
    await t.mutation(internal.auth.store, {
      args: {
        type: "userOAuth",
        provider: "apple",
        providerAccountId: id,
        profile: rest,
        signature: `sig-${refreshToken}`,
      },
    });
  }

  it("stores it beside the account, never on the user row, and keeps only the latest", async () => {
    const t = newConvexTest();
    await signIn(t, "first");
    await signIn(t, "second");

    const { users, tokens } = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      tokens: await ctx.db.query("appleTokens").collect(),
    }));
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "a@example.com" });
    expect(users[0]).not.toHaveProperty("appleRefreshToken");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: users[0]._id,
      refreshToken: "second",
    });
  });

  it("drops the native sheet's client id when a web sign-in replaces its token", async () => {
    const t = newConvexTest();
    await signIn(t, "web-first");
    const row = (await tokenRows(t))[0];
    await t.mutation(internal.users.keepNativeAppleToken, {
      userId: row.userId,
      refreshToken: "native",
      clientId: "app.shelvr.save",
    });
    expect((await tokenRows(t))[0]).toMatchObject({
      refreshToken: "native",
      clientId: "app.shelvr.save",
    });

    await signIn(t, "web-again");

    const tokens = await tokenRows(t);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ refreshToken: "web-again" });
    expect(tokens[0]).not.toHaveProperty("clientId");
  });
});

describe("deleting an account that signed in with Apple", () => {
  it("points the revoke job at the token row, never at the token itself", async () => {
    const t = newConvexTest();
    const { userId, tokenId } = await tokenRow(t);

    await as(t, userId).mutation(api.users.deleteCurrentUserAccount, {});

    const jobs = await scheduledRevokes(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args).toEqual([{ tokenId }]);
    expect(JSON.stringify(jobs[0].args)).not.toContain("r.token");

    // Even if the revoke job never runs, the token does not outlive the hour.
    const fallback = (
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    ).find((job) => job.name === "users:forgetAppleToken");
    expect(fallback?.args).toEqual([{ tokenId }]);
    await t.mutation(internal.users.forgetAppleToken, { tokenId });
    expect(await tokenRows(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(userId))).toBeNull();
  });

  it("still deletes the account when no token was ever captured", async () => {
    const t = newConvexTest();
    const userId = await appleUser(t);

    await as(t, userId).mutation(api.users.deleteCurrentUserAccount, {});

    expect(await scheduledRevokes(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(userId))).toBeNull();
  });
});

describe("revoke", () => {
  it("posts the token to Apple with a client secret signed by the team key", async () => {
    const key = await configure();
    const t = newConvexTest();
    const { tokenId } = await tokenRow(t);

    await t.action(internal.appleRevoke.revoke, { tokenId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tokenRows(t)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("client_id")).toBe("app.shelvr.signin");
    expect(body.get("token")).toBe("r.token");
    expect(body.get("token_type_hint")).toBe("refresh_token");

    const [header, payload, signature] = body.get("client_secret")!.split(".");
    const decode = (part: string) =>
      JSON.parse(new TextDecoder().decode(base64Url(part)));
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(decode(payload)).toMatchObject({
      iss: "TEAM456",
      sub: "app.shelvr.signin",
      aud: "https://appleid.apple.com",
    });
    expect(decode(payload).exp).toBeGreaterThan(decode(payload).iat);
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key.publicKey,
        base64Url(signature),
        new TextEncoder().encode(`${header}.${payload}`),
      ),
    ).toBe(true);
  });

  it("revokes a native-sheet token as the app it was issued to, not the web Service ID", async () => {
    await configure();
    const t = newConvexTest();
    const { tokenId } = await tokenRow(t);
    await t.run((ctx) =>
      ctx.db.patch(tokenId, { clientId: "app.shelvr.save" }),
    );

    await t.action(internal.appleRevoke.revoke, { tokenId });

    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(body.get("client_id")).toBe("app.shelvr.save");
    const payload = body.get("client_secret")!.split(".")[1];
    expect(
      JSON.parse(new TextDecoder().decode(base64Url(payload))),
    ).toMatchObject({ sub: "app.shelvr.save" });
    expect(await tokenRows(t)).toEqual([]);
  });

  it("does nothing when the signing key is not configured", async () => {
    vi.stubEnv("AUTH_APPLE_ID", "app.shelvr.signin");
    const t = newConvexTest();
    const { tokenId } = await tokenRow(t);
    await t.action(internal.appleRevoke.revoke, { tokenId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await scheduledRevokes(t)).toEqual([]);
    expect(await tokenRows(t)).toEqual([]);
  });

  it("does not throw on a malformed key or a refusal from Apple", async () => {
    await configure();
    vi.stubEnv("APPLE_REVOKE_PRIVATE_KEY", "not a key");
    const t = newConvexTest();
    const first = await tokenRow(t);
    await t.action(internal.appleRevoke.revoke, { tokenId: first.tokenId });
    expect(fetchMock).not.toHaveBeenCalled();

    await configure();
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const second = await tokenRow(t);
    await t.action(internal.appleRevoke.revoke, { tokenId: second.tokenId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await scheduledRevokes(t)).toEqual([]);
    expect(await tokenRows(t)).toEqual([]);
  });

  it("keeps the token and tries again when Apple rate limits the request", async () => {
    await configure();
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    const t = newConvexTest();
    const { tokenId } = await tokenRow(t);

    await t.action(internal.appleRevoke.revoke, { tokenId });

    expect((await scheduledRevokes(t))[0].args).toEqual([
      { tokenId, attempt: 2 },
    ]);
    expect(await tokenRows(t)).toHaveLength(1);
  });

  it("tries again later when Apple is unreachable, a bounded number of times", async () => {
    await configure();
    fetchMock.mockRejectedValue(new Error("network down"));
    const t = newConvexTest();
    const { tokenId } = await tokenRow(t);

    await t.action(internal.appleRevoke.revoke, { tokenId });
    const [retry] = await scheduledRevokes(t);
    expect(retry.args).toEqual([{ tokenId, attempt: 2 }]);
    expect(await tokenRows(t)).toHaveLength(1);

    await t.action(internal.appleRevoke.revoke, { tokenId, attempt: 3 });
    expect(await scheduledRevokes(t)).toHaveLength(1);
    expect(await tokenRows(t)).toEqual([]);
  });
});
