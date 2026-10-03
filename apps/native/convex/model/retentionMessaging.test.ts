// @vitest-environment edge-runtime
// Runs under edge-runtime so `crypto.subtle` behaves like the default Convex
// V8 runtime that http.ts executes in.
import { describe, expect, it } from "vitest";

import { APPLE_ROOT_CA_G3 } from "./appleJws";
// A throwaway chain shaped like Apple's: P-384 root and intermediate, P-256
// leaf, Apple's marker extensions, 100-year validity from 2026-10-03.
// `unmarkedLeaf` is signed by a leaf without the marker; `otherApp` carries a
// different appAppleId.
import fixtures from "./appleJws.fixtures.json";
import { answerRetentionRequest } from "./retentionMessaging";

const now = Date.UTC(2026, 9, 4);
const messageId = "0f3a6b1e-5d2c-4c7a-9e55-2b1d6f0c8a11";
const answer = (signedPayload: string, root = fixtures.root, at = now) =>
  answerRetentionRequest(JSON.stringify({ signedPayload }), {
    root,
    now: at,
    messageId,
  });

function flipLastByte(segment: string): string {
  const bytes = Buffer.from(segment, "base64url");
  bytes[bytes.length - 1] ^= 1;
  return bytes.toString("base64url");
}

it("pins the root certificate Apple publishes", async () => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Buffer.from(APPLE_ROOT_CA_G3, "base64"),
  );
  // https://www.apple.com/certificateauthority/ lists this fingerprint.
  expect(Buffer.from(digest).toString("hex")).toBe(
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",
  );
});

describe("answerRetentionRequest", () => {
  it("names the configured message for a request Apple signed for Shelvr", async () => {
    expect(await answer(fixtures.valid)).toEqual({
      status: 200,
      body: { message: { messageIdentifier: messageId } },
    });
  });

  it("leaves Apple on its default message when none is configured", async () => {
    const reply = await answerRetentionRequest(
      JSON.stringify({ signedPayload: fixtures.valid }),
      { root: fixtures.root, now },
    );
    expect(reply).toEqual({ status: 200, body: {} });
  });

  it("rejects a chain that does not end in the trusted root", async () => {
    expect(await answer(fixtures.valid, APPLE_ROOT_CA_G3)).toMatchObject({
      status: 400,
      reason: "chain_root",
    });
  });

  it("rejects a payload changed after signing", async () => {
    const [header, , signature] = fixtures.valid.split(".");
    const forged = Buffer.from(
      JSON.stringify({ appAppleId: 6798143550 }),
    ).toString("base64url");
    expect(await answer(`${header}.${forged}.${signature}`)).toMatchObject({
      status: 400,
      reason: "jws_signature",
    });
  });

  it("rejects a tampered signature", async () => {
    const [header, payload, signature] = fixtures.valid.split(".");
    expect(
      await answer(`${header}.${payload}.${flipLastByte(signature)}`),
    ).toMatchObject({ status: 400, reason: "jws_signature" });
  });

  it("rejects a leaf certificate altered after it was issued", async () => {
    const [headerSegment, payload, signature] = fixtures.valid.split(".");
    const header = JSON.parse(
      Buffer.from(headerSegment, "base64url").toString(),
    );
    const leaf = Buffer.from(header.x5c[0], "base64");
    // The last byte of the certificate is the end of the issuer's signature.
    leaf[leaf.length - 1] ^= 1;
    header.x5c[0] = leaf.toString("base64");
    const forged = Buffer.from(JSON.stringify(header)).toString("base64url");
    expect(await answer(`${forged}.${payload}.${signature}`)).toMatchObject({
      status: 400,
      reason: "chain_signature",
    });
  });

  it("rejects a leaf without Apple's App Store marker", async () => {
    expect(await answer(fixtures.unmarkedLeaf)).toMatchObject({
      status: 400,
      reason: "chain_marker",
    });
  });

  it("rejects a chain outside its validity window", async () => {
    expect(
      await answer(fixtures.valid, fixtures.root, Date.UTC(2200, 0, 1)),
    ).toMatchObject({ status: 400, reason: "chain_expired" });
    expect(
      await answer(fixtures.valid, fixtures.root, Date.UTC(2020, 0, 1)),
    ).toMatchObject({ status: 400, reason: "chain_expired" });
  });

  it("rejects a signed request for another app", async () => {
    expect(await answer(fixtures.otherApp)).toMatchObject({
      status: 400,
      reason: "wrong_app",
    });
  });

  it("rejects a body that is not Apple's shape", async () => {
    const options = { root: fixtures.root, now, messageId };
    expect(await answerRetentionRequest("not json", options)).toMatchObject({
      status: 400,
      reason: "body_json",
    });
    expect(await answerRetentionRequest("{}", options)).toMatchObject({
      status: 400,
      reason: "body_shape",
    });
    expect(await answer("a.b")).toMatchObject({
      status: 400,
      reason: "jws_shape",
    });
  });
});
