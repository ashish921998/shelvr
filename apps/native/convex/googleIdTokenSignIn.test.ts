// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import {
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { newConvexTest } from "./test.setup";

const CLIENT_ID = "web-client.apps.googleusercontent.com";

let googleKey: CryptoKey;
let jwks: { keys: object[] };

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  googleKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "google-1" }] };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(privateKey));
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubEnv("AUTH_GOOGLE_ID", CLIENT_ID);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(jwks)),
  );
  return newConvexTest();
}

function idToken(claims: Record<string, unknown>, audience = CLIENT_ID) {
  return new SignJWT({
    email: "ana@example.com",
    email_verified: true,
    name: "Ana",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "google-1" })
    .setIssuer("https://accounts.google.com")
    .setAudience(audience)
    .setSubject("google-sub-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(googleKey);
}

describe("native Google sign-in with an ID token", () => {
  it("signs in to the account the browser Google flow created", async () => {
    const backend = await setup();
    const userId = await backend.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        email: "ana@example.com",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: "google-sub-1",
      });
      return id;
    });

    const result = await backend.action(api.auth.signIn, {
      provider: "google-id-token",
      params: { idToken: await idToken({}) },
    });

    expect(result).toMatchObject({ tokens: { token: expect.any(String) } });
    const { users, accounts } = await backend.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      accounts: await ctx.db.query("authAccounts").collect(),
    }));
    expect(users.map((u) => u._id)).toEqual([userId]);
    expect(accounts).toHaveLength(1);
  });

  it("creates a new user with a google account on first sign-in", async () => {
    const backend = await setup();

    await backend.action(api.auth.signIn, {
      provider: "google-id-token",
      params: { idToken: await idToken({}) },
    });

    const accounts = await backend.run((ctx) =>
      ctx.db.query("authAccounts").collect(),
    );
    expect(accounts).toMatchObject([
      { provider: "google", providerAccountId: "google-sub-1" },
    ]);
  });

  it.each([
    ["another app's token", () => idToken({}, "other-client")],
    ["an unverified email", () => idToken({ email_verified: false })],
    ["a token that is not a JWT", async () => "not-a-token"],
  ])("rejects %s", async (_label, makeToken) => {
    const backend = await setup();

    const result = await backend.action(api.auth.signIn, {
      provider: "google-id-token",
      params: { idToken: await makeToken() },
    });

    expect(result).toEqual({ tokens: null });
    const users = await backend.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });
});
