import { afterEach, describe, expect, it, vi } from "vitest";

import { serverLog } from "./serverLog";

describe("serverLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes scalar fields as structured JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    serverLog("warn", "waitlist_rate_limited", {
      status: 429,
      retryable: true,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({
      level: "warn",
      event: "waitlist_rate_limited",
      status: 429,
      retryable: true,
    });
  });
});
