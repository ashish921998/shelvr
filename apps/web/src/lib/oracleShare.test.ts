import { describe, expect, it } from "vitest";

import {
  decodeSharedVerdict,
  encodeSharedVerdict,
  type SharedVerdict,
  sharedVerdictPath,
} from "./oracleShare";

const VERDICT: SharedVerdict = {
  mode: "links",
  persona: "The Someday Chef",
  tagline: "Café recipes you’ll cook “next weekend”, every weekend. 🍝",
  spaces: [
    { name: "Weeknight Pasta", reason: "The recipes you actually cook." },
    { name: "Lisbon", reason: "Cafés for the trip you keep planning." },
    { name: "Kitchen Kit", reason: "The pan you’ve priced four times." },
  ],
};

function wire(value: unknown): string {
  return encodeURIComponent(
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  );
}

describe("shared verdict codes", () => {
  it("round-trips a verdict, emoji and curly quotes included", () => {
    const code = encodeSharedVerdict(VERDICT);

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSharedVerdict(code)).toEqual(VERDICT);
  });

  it("clips overlong model output so the link still decodes", () => {
    const code = encodeSharedVerdict({
      mode: "tabs",
      persona: "€".repeat(500),
      tagline: "€".repeat(2000),
      spaces: Array(5).fill({ name: "€".repeat(300), reason: "€".repeat(900) }),
    });
    const decoded = decodeSharedVerdict(code);

    expect(code.length).toBeLessThanOrEqual(4096);
    expect(decoded?.persona).toHaveLength(80);
    expect(decoded?.spaces).toHaveLength(3);
  });

  it("builds a path under /oracle/s", () => {
    expect(sharedVerdictPath(VERDICT)).toBe(
      `/oracle/s?c=${encodeSharedVerdict(VERDICT)}`,
    );
  });

  it.each([
    ["an empty code", ""],
    ["garbage", "!!not base64!!"],
    ["base64 that is not JSON", btoa("hello world")],
    ["an unknown mode", wire({ m: "horoscope", p: "A", t: "B", s: [] })],
    ["a missing persona", wire({ m: "links", t: "B", s: [] })],
    [
      "a space that is not a pair",
      wire({ m: "links", p: "A", t: "B", s: [["x"]] }),
    ],
    [
      "too many spaces",
      wire({ m: "links", p: "A", t: "B", s: Array(4).fill(["x", "y"]) }),
    ],
    ["a code over 4 KB", "A".repeat(4097)],
  ])("decodes %s to undefined", (_, code) => {
    expect(decodeSharedVerdict(decodeURIComponent(code))).toBeUndefined();
  });
});
