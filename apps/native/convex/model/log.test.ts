import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorName, logEvent } from "./log";

function lastLine(spy: {
  mock: { calls: unknown[][] };
}): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  expect(call).toBeDefined();
  expect(call).toHaveLength(1);
  return JSON.parse(String(call?.[0]));
}

describe("logEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits one JSON line with level, event, environment, then fields", () => {
    vi.stubEnv("OBSERVABILITY_ENV", "production");
    logEvent("error", "process_item_failed", {
      item_id: "abc",
      error_category: "model_timeout",
      attempt: 2,
    });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(lastLine(vi.mocked(console.error))).toEqual({
      level: "error",
      event: "process_item_failed",
      environment: "production",
      item_id: "abc",
      error_category: "model_timeout",
      attempt: 2,
    });
  });

  it("routes each level to the matching console method", () => {
    logEvent("info", "model_usage");
    logEvent("warn", "delivery_failed");
    logEvent("error", "sync_failed");
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(lastLine(vi.mocked(console.log)).level).toBe("info");
    expect(lastLine(vi.mocked(console.warn)).level).toBe("warn");
    expect(lastLine(vi.mocked(console.error)).level).toBe("error");
  });

  it("defaults the environment and drops undefined fields", () => {
    vi.stubEnv("OBSERVABILITY_ENV", undefined);
    logEvent("warn", "resend_failed", { status: undefined, step: "create" });
    const line = lastLine(vi.mocked(console.warn));
    expect(line.environment).toBe("development");
    expect(line).not.toHaveProperty("status");
    expect(line.step).toBe("create");
  });
});

describe("errorName", () => {
  it("returns the class of an Error and the typeof anything else", () => {
    class ConvexError extends Error {
      name = "ConvexError";
    }
    expect(errorName(new TypeError("fetch failed: https://x"))).toBe(
      "TypeError",
    );
    expect(errorName(new ConvexError("Value: secret"))).toBe("ConvexError");
    expect(errorName("boom")).toBe("string");
    expect(errorName(undefined)).toBe("undefined");
  });
});
