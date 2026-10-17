// @vitest-environment edge-runtime
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyAppleIdToken } from "./appleIdToken";

const NONCE = "raw-nonce";
const AUDIENCE = "app.shelvr.save";

let apple: CryptoKey;
let stranger: CryptoKey;
let jwks: JSONWebKeySet;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function mint(
  overrides: {
    issuer?: string;
    audience?: string;
    expiresAt?: number;
    nonce?: string;
    key?: CryptoKey;
    claims?: Record<string, unknown>;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    nonce: await sha256Hex(overrides.nonce ?? NONCE),
    email: "person@example.com",
    email_verified: "true",
    ...overrides.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "apple-key" })
    .setIssuer(overrides.issuer ?? "https://appleid.apple.com")
    .setAudience(overrides.audience ?? AUDIENCE)
    .setSubject("apple-sub-1")
    .setIssuedAt(now - 60)
    .setExpirationTime(overrides.expiresAt ?? now + 600)
    .sign(overrides.key ?? apple);
}

const verify = (identityToken: string, nonce = NONCE) =>
  verifyAppleIdToken({
    identityToken,
    nonce,
    audiences: [AUDIENCE],
    keys: async () => jwks,
  });

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  apple = pair.privateKey;
  stranger = (await generateKeyPair("RS256")).privateKey;
  jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "apple-key" }],
  };
});

describe("verifyAppleIdToken", () => {
  it("returns the subject and verified email of a valid token", async () => {
    await expect(verify(await mint())).resolves.toEqual({
      sub: "apple-sub-1",
      audience: "app.shelvr.save",
      email: "person@example.com",
    });
  });

  it("drops an email Apple has not verified", async () => {
    const token = await mint({ claims: { email_verified: "false" } });

    await expect(verify(token)).resolves.toEqual({
      sub: "apple-sub-1",
      audience: "app.shelvr.save",
    });
  });

  it.each([
    ["wrong_audience", { audience: "com.someone.else" }],
    ["wrong_issuer", { issuer: "https://accounts.example.com" }],
    ["expired", { expiresAt: Math.floor(Date.now() / 1000) - 10 }],
    ["wrong_nonce", { nonce: "another-sign-in" }],
  ] as const)("rejects a token with %s", async (code, overrides) => {
    await expect(verify(await mint(overrides))).rejects.toMatchObject({
      name: "AppleIdTokenError",
      code,
    });
  });

  it("rejects a token Apple's keys did not sign", async () => {
    await expect(verify(await mint({ key: stranger }))).rejects.toMatchObject({
      code: "bad_signature",
    });
  });

  it("rejects the nonce Apple was given in place of the value behind it", async () => {
    await expect(
      verify(await mint(), await sha256Hex(NONCE)),
    ).rejects.toMatchObject({ code: "wrong_nonce" });
  });
});
