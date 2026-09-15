import { afterEach, describe, expect, it, vi } from "vitest";
import { startRevenueCatIdentitySync } from "./revenuecat-identity-sync";

afterEach(() => vi.useRealTimers());

describe("RevenueCat identity registration", () => {
  it("recovers from a temporary login failure without another sign-in", async () => {
    vi.useFakeTimers();
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const onReady = vi.fn();
    const onError = vi.fn();
    const observer = startRevenueCatIdentitySync({ sync, onReady, onError });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    observer.retry();
    await vi.runAllTimersAsync();
    expect(sync).toHaveBeenCalledTimes(2);
    observer.dispose();
  });

  it("bounds automatic retries and starts a new attempt when foregrounded", async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockRejectedValue(new Error("offline"));
    const onReady = vi.fn();
    const observer = startRevenueCatIdentitySync({
      sync,
      onReady,
      onError: vi.fn(),
    });
    await vi.runAllTimersAsync();
    expect(sync).toHaveBeenCalledTimes(3);
    expect(onReady).not.toHaveBeenCalled();
    sync.mockResolvedValue(undefined);
    observer.retry();
    await vi.runAllTimersAsync();
    expect(sync).toHaveBeenCalledTimes(4);
    expect(onReady).toHaveBeenCalledOnce();
    observer.dispose();
  });

  it("cancels retries after sign-out", async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockRejectedValue(new Error("offline"));
    const observer = startRevenueCatIdentitySync({
      sync,
      onReady: vi.fn(),
      onError: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    observer.dispose();
    observer.retry();
    await vi.runAllTimersAsync();
    expect(sync).toHaveBeenCalledOnce();
  });

  it("does not mark a disposed account ready when its login finishes", async () => {
    let finish = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const sync = vi.fn(() => pending);
    const onReady = vi.fn();
    const observer = startRevenueCatIdentitySync({
      sync,
      onReady,
      onError: vi.fn(),
    });
    observer.retry();
    expect(sync).toHaveBeenCalledOnce();
    observer.dispose();
    finish();
    await pending;
    expect(onReady).not.toHaveBeenCalled();
  });
});
