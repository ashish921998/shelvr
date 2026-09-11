import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { DEMO_ERROR_MESSAGES, demoError, demoErrorCode, isRateLimitedError } from "./demoErrors";

describe("demo error classification", () => {
  it("round-trips a code through the ConvexError data the client receives", () => {
    const error = demoError("terminal_failure");
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.data).toEqual({
      code: "terminal_failure",
      message: DEMO_ERROR_MESSAGES.terminal_failure,
    });
    expect(demoErrorCode(error)).toBe("terminal_failure");
  });

  it("returns null for anything that is not a demo ConvexError", () => {
    // What production hands the client for a plain server Error.
    expect(demoErrorCode(new Error("Server Error"))).toBeNull();
    expect(demoErrorCode(new ConvexError("Photo limit reached"))).toBeNull();
    expect(demoErrorCode(new ConvexError({ code: "not_a_demo_code" }))).toBeNull();
    expect(demoErrorCode(undefined)).toBeNull();
    expect(demoErrorCode("Demo save already used")).toBeNull();
  });

  it("recognises the rate limiter's structured error and nothing else", () => {
    expect(
      isRateLimitedError(
        new ConvexError({ kind: "RateLimited", name: "demoRetry", retryAfter: 1000 }),
      ),
    ).toBe(true);
    expect(isRateLimitedError(demoError("too_many_retries"))).toBe(false);
    expect(isRateLimitedError(new Error("RateLimited"))).toBe(false);
  });
});
