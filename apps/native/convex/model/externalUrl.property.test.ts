import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isUrlPolicyError,
  MAX_URL_LENGTH,
  normalizeExternalUrl,
} from "./externalUrl";

/** Real-looking links, schemeless input, and arbitrary junk, mixed. */
const input = fc.oneof(
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.domain(),
  fc.webUrl().map((u) => u.replace(/^https?:\/\//, "")),
  fc
    .tuple(
      fc.constantFrom(
        "javascript:",
        "data:",
        "file://",
        "ftp://",
        "http://u:p@",
      ),
      fc.domain(),
    )
    .map(([a, b]) => a + b),
  fc
    .tuple(fc.domain(), fc.integer({ min: 0, max: 65535 }))
    .map(([host, port]) => `https://${host}:${port}/`),
  fc.string(),
);

function normalized(raw: string): string | null {
  try {
    return normalizeExternalUrl(raw);
  } catch (e) {
    // Rejection must always be a policy error with a stable code, never a
    // stray TypeError the caller does not expect.
    expect(isUrlPolicyError(e)).toBe(true);
    return null;
  }
}

describe("normalizeExternalUrl", () => {
  it("only ever returns a plain http(s) URL a save may fetch", () => {
    fc.assert(
      fc.property(input, (raw) => {
        const url = normalized(raw);
        if (url === null) return;
        const parsed = new URL(url);
        expect(["http:", "https:"]).toContain(parsed.protocol);
        expect(parsed.username).toBe("");
        expect(parsed.password).toBe("");
        expect(parsed.port).toBe("");
        expect(parsed.hostname).not.toBe("");
        expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
      }),
    );
  });

  it("is idempotent: a normalized URL normalizes to itself", () => {
    fc.assert(
      fc.property(input, (raw) => {
        const url = normalized(raw);
        if (url === null) return;
        expect(normalizeExternalUrl(url)).toBe(url);
      }),
    );
  });
});
