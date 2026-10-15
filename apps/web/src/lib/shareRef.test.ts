// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { shareRef } from "./shareRef";

describe("shareRef", () => {
  it("is the first 16 hex characters of the token's SHA-256", async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223…
    expect(await shareRef("abc")).toBe("ba7816bf8f01cfea");
  });
});
