import { afterEach, describe, expect, it, vi } from "vitest";
import { readConvexUrl } from "./convex-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readConvexUrl", () => {
  it("returns the inlined build-time URL", () => {
    vi.stubEnv("EXPO_PUBLIC_CONVEX_URL", "https://test-123.convex.cloud");
    expect(readConvexUrl()).toBe("https://test-123.convex.cloud");
  });

  it("throws a named error when the build env var is missing or empty", () => {
    vi.stubEnv("EXPO_PUBLIC_CONVEX_URL", "");
    expect(() => readConvexUrl()).toThrow(/EXPO_PUBLIC_CONVEX_URL/);
  });
});
