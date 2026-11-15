import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { revokeFailureReason, revokeWithRetry } from "./capture-revoke";

describe("revokeFailureReason", () => {
  it("names each failure a Convex mutation can reject with", () => {
    expect(revokeFailureReason(new ConvexError({ code: "x" }))).toBe(
      "convex_error",
    );
    expect(revokeFailureReason(new Error("Network request failed"))).toBe(
      "network",
    );
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(revokeFailureReason(aborted)).toBe("network");
    expect(
      revokeFailureReason(
        new Error(
          "[CONVEX M(appIntents:revokeCaptureToken)] [Request ID: abc] Server Error\nUncaught Error: Not authenticated",
        ),
      ),
    ).toBe("not_authenticated");
    expect(
      revokeFailureReason(
        new Error(
          "[CONVEX M(appIntents:revokeCaptureToken)] [Request ID: abc] Server Error\n  Called by client",
        ),
      ),
    ).toBe("server_error");
    expect(revokeFailureReason(new Error("something else"))).toBe("unknown");
    expect(revokeFailureReason("text")).toBe("unknown");
  });
});

describe("revokeWithRetry", () => {
  it("calls the revoke once when it succeeds", async () => {
    const revoke = vi.fn(async () => null);
    const wait = vi.fn(async () => {});
    await revokeWithRetry(revoke, wait);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries once after a wait when the first call rejects", async () => {
    const revoke = vi
      .fn<() => Promise<null>>()
      .mockRejectedValueOnce(new Error("Server Error"))
      .mockResolvedValueOnce(null);
    const wait = vi.fn(async () => {});
    await revokeWithRetry(revoke, wait);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("rejects with the second error when the retry also fails", async () => {
    const second = new Error("Network request failed");
    const revoke = vi
      .fn<() => Promise<null>>()
      .mockRejectedValueOnce(new Error("Server Error"))
      .mockRejectedValueOnce(second);
    await expect(revokeWithRetry(revoke, async () => {})).rejects.toBe(second);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
