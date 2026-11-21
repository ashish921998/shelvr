// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { importPKCS8, jwtVerify, SignJWT, importSPKI } from "jose";
import { describe, expect, test } from "vitest";
import { muxKeyToPkcs8Pem } from "./muxKey";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

async function roundTrip(secret: string) {
  const key = await importPKCS8(muxKeyToPkcs8Pem(secret), "RS256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("play1")
    .sign(key);
  const verified = await jwtVerify(token, await importSPKI(publicKey, "RS256"));
  return verified.payload.sub;
}

describe("muxKeyToPkcs8Pem", () => {
  test("accepts Mux's base64-encoded RSA key", async () => {
    const base64 = Buffer.from(privateKey).toString("base64");
    expect(await roundTrip(base64)).toBe("play1");
  });

  test("accepts a raw PEM", async () => {
    expect(await roundTrip(privateKey)).toBe("play1");
  });

  test("rejects anything else", () => {
    expect(() => muxKeyToPkcs8Pem("-----BEGIN NOPE-----")).toThrow(
      "not a PEM key",
    );
  });
});
