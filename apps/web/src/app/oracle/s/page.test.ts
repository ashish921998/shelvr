import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/oracleProof", () => ({
  verifiedVerdict: async (code: string) =>
    code === "good.sig"
      ? { persona: "The Collector", tagline: "You keep everything." }
      : undefined,
}));

import { generateMetadata } from "./page";

const props = (c: string) => ({ searchParams: Promise.resolve({ c }) });

describe("shared verdict metadata", () => {
  it("gives a verdict its own og:url, so a preview keeps the verdict", async () => {
    const metadata = await generateMetadata(props("good.sig"));
    expect(metadata.openGraph?.url).toBe("/oracle/s?c=good.sig");
  });

  it("falls back to /oracle for a code that does not verify", async () => {
    const metadata = await generateMetadata(props("forged"));
    expect(metadata.openGraph?.url).toBe("/oracle");
  });
});
