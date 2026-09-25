// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";

describe("oracleLimits.claim", () => {
  it("stops the fifth consult from one IP within the hour", async () => {
    const t = newConvexTest();
    const claim = (ip: string) =>
      t.mutation(internal.oracleLimits.claim, { ip });

    for (let i = 0; i < 4; i++) {
      await expect(claim("203.0.113.7")).resolves.toBeNull();
    }
    const fifth = await claim("203.0.113.7").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isRateLimitError(fifth)).toBe(true);

    await expect(claim("198.51.100.9")).resolves.toBeNull();
  });
});
