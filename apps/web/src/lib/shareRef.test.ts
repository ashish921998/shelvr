// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { shareRef } from "./shareRef";

describe("shareRef", () => {
  it("is the first 16 hex characters of the token's SHA-256", async () => {
    expect(await shareRef("abc")).toBe("ba7816bf8f01cfea");
  });
});
