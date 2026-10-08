// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

// The native Sign in with Apple path end to end: the client's identity token
// goes in, a session comes out, and the account lands where the web Apple flow
// keeps it.
const NONCE = "raw-nonce";
const SUB = "001234.abcdef.5678";

let appleKey: CryptoKey;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function identityToken(
  claims: Record<string, unknown> = {},
  audience = "app.shelvr.save",
) {
  return await new SignJWT({
    nonce: await sha256Hex(NONCE),
    email: "person@example.com",
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "apple-key" })
    .setIssuer("https://appleid.apple.com")
    .setAudience(audience)
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(appleKey);
}

function signIn(
  backend: ReturnType<typeof newConvexTest>,
  params: Record<string, string>,
) {
  return backend.action(api.auth.signIn, { provider: "apple-native", params });
}

const tables = (backend: ReturnType<typeof newConvexTest>) =>
  backend.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    accounts: await ctx.db.query("authAccounts").collect(),
  }));

beforeEach(async () => {
  vi.useFakeTimers();
  const apple = await generateKeyPair("RS256");
  appleKey = apple.privateKey;
  const jwks = {
    keys: [{ ...(await exportJWK(apple.publicKey)), kid: "apple-key" }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) !== "https://appleid.apple.com/auth/keys")
        throw new Error("Unexpected fetch");
      return Response.json(jwks);
    }),
  );
  const session = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(session.privateKey));
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native Sign in with Apple", () => {
  it("creates a user under the Apple provider, keyed by the token subject", async () => {
    const backend = newConvexTest();

    const result = await signIn(backend, {
      identityToken: await identityToken(),
      nonce: NONCE,
      name: "Ada Lovelace",
    });
    await backend.finishAllScheduledFunctions(vi.runAllTimers);

    expect(result).toMatchObject({
      tokens: { token: expect.any(String), refreshToken: expect.any(String) },
    });
    const { users, accounts } = await tables(backend);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "person@example.com",
    });
    expect(users[0]).not.toHaveProperty("image");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      provider: "apple",
      providerAccountId: SUB,
      userId: users[0]?._id,
    });
  });

  it("returns the same user on a second sign-in and keeps the name and email", async () => {
    const backend = newConvexTest();
    await signIn(backend, {
      identityToken: await identityToken(),
      nonce: NONCE,
      name: "Ada Lovelace",
    });

    // Apple hands over the name only once, and a later token may carry no
    // email either.
    const result = await signIn(backend, {
      identityToken: await identityToken({ email: undefined }),
      nonce: NONCE,
    });
    await backend.finishAllScheduledFunctions(vi.runAllTimers);

    expect(result).toMatchObject({ tokens: { token: expect.any(String) } });
    const { users, accounts } = await tables(backend);
    expect(users).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "person@example.com",
    });
  });

  it("reuses the account the web Apple flow made for the same subject", async () => {
    const backend = newConvexTest();
    const webUserId = await backend.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Web Person",
        email: "relay@privaterelay.appleid.com",
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "apple",
        providerAccountId: SUB,
      });
      return userId;
    });

    const result = await signIn(backend, {
      identityToken: await identityToken(),
      nonce: NONCE,
      name: "Someone Else",
    });
    await backend.finishAllScheduledFunctions(vi.runAllTimers);

    expect(result).toMatchObject({ tokens: { token: expect.any(String) } });
    const { users, accounts } = await tables(backend);
    expect(users).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    expect(users[0]).toMatchObject({
      _id: webUserId,
      name: "Web Person",
      email: "relay@privaterelay.appleid.com",
    });
  });

  it.each([
    ["a token for another app", () => identityToken({}, "app.shelvr.save.dev")],
    ["a token answering another nonce", () => identityToken({ nonce: "x" })],
    ["no token at all", async () => undefined],
  ])("signs nobody in with %s", async (_case, token) => {
    const backend = newConvexTest();
    const minted = await token();

    const result = await signIn(backend, {
      ...(minted === undefined ? {} : { identityToken: minted }),
      nonce: NONCE,
    });

    expect(result).toEqual({ tokens: null });
    const { users, accounts } = await tables(backend);
    expect(users).toHaveLength(0);
    expect(accounts).toHaveLength(0);
  });

  it("accepts the development bundle only on the dev deployment", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://amicable-antelope-639.convex.site");
    const backend = newConvexTest();

    const dev = await signIn(backend, {
      identityToken: await identityToken({}, "app.shelvr.save.dev"),
      nonce: NONCE,
    });
    const store = await signIn(backend, {
      identityToken: await identityToken({ sub: "other" }, "app.shelvr.save"),
      nonce: NONCE,
    });
    await backend.finishAllScheduledFunctions(vi.runAllTimers);

    expect(dev).toMatchObject({ tokens: { token: expect.any(String) } });
    expect(store).toEqual({ tokens: null });
  });
});
