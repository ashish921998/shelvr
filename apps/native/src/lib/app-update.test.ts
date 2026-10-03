// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndFetch,
  deriveUpdateState,
  useAppUpdate,
  type UpdateSignals,
} from "./app-update";

// The module reads __DEV__ at import; a release build is what ships.
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

const updates = vi.hoisted(() => ({
  checkForUpdateAsync: vi.fn(),
  fetchUpdateAsync: vi.fn(),
  reloadAsync: vi.fn(),
  flags: { isChecking: false, isDownloading: false, isUpdatePending: false },
}));
const captureError = vi.hoisted(() => vi.fn());

vi.mock("expo-updates", () => ({
  isEnabled: true,
  checkForUpdateAsync: updates.checkForUpdateAsync,
  fetchUpdateAsync: updates.fetchUpdateAsync,
  reloadAsync: updates.reloadAsync,
  useUpdates: () => ({
    currentlyRunning: { isEmbeddedLaunch: true },
    ...updates.flags,
  }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError },
}));

const signals = (overrides: Partial<UpdateSignals> = {}): UpdateSignals => ({
  unsupported: null,
  acting: null,
  isChecking: false,
  isDownloading: false,
  isUpdatePending: false,
  outcome: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  updates.flags = {
    isChecking: false,
    isDownloading: false,
    isUpdatePending: false,
  };
});

describe("deriveUpdateState", () => {
  it("reports unsupported builds before anything else", () => {
    expect(
      deriveUpdateState(
        signals({ unsupported: "disabled", isUpdatePending: true }),
      ),
    ).toEqual({ kind: "unsupported", reason: "disabled" });
  });

  it("shows a failed restart without also claiming the update is ready", () => {
    expect(
      deriveUpdateState(
        signals({ isUpdatePending: true, outcome: "restartFailed" }),
      ),
    ).toEqual({ kind: "failed", at: "restart" });
  });

  it("drops a stale up-to-date result once a background download lands", () => {
    expect(
      deriveUpdateState(
        signals({ isUpdatePending: true, outcome: "upToDate" }),
      ),
    ).toEqual({ kind: "ready" });
  });

  it("treats the moment between tap and native flag as checking", () => {
    expect(deriveUpdateState(signals({ acting: "check" }))).toEqual({
      kind: "checking",
    });
  });
});

describe("checkAndFetch", () => {
  it("stops at up to date without downloading", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: false,
    });
    await expect(checkAndFetch()).resolves.toBe("upToDate");
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("fetches a rollback directive even though nothing is available", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: true,
    });
    updates.fetchUpdateAsync.mockResolvedValue({
      isNew: false,
      isRollBackToEmbedded: true,
    });
    await expect(checkAndFetch()).resolves.toBe("fetched");
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });
});

describe("useAppUpdate", () => {
  it("lands in failed and reports once when the check rejects", async () => {
    updates.checkForUpdateAsync.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAppUpdate("#fff", "#000"));
    await act(() => result.current.act());
    expect(result.current.state).toEqual({ kind: "failed", at: "check" });
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(
      "update_check_failed",
      expect.any(Error),
    );
  });

  it("ignores a second tap while the first check is running", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updates.checkForUpdateAsync.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useAppUpdate("#fff", "#000"));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.act();
      void result.current.act();
    });
    finish({ isAvailable: false, isRollBackToEmbedded: false });
    await act(() => first);
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: "upToDate" });
  });

  it("reports a failed download as a failed check", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      isRollBackToEmbedded: false,
    });
    updates.fetchUpdateAsync.mockRejectedValue(new Error("dropped"));
    const { result } = renderHook(() => useAppUpdate("#fff", "#000"));
    await act(() => result.current.act());
    expect(result.current.state).toEqual({ kind: "failed", at: "check" });
  });

  it("replaces an up-to-date result when a background download lands", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: false,
    });
    const { result, rerender } = renderHook(() => useAppUpdate("#fff", "#000"));
    await act(() => result.current.act());
    expect(result.current.state).toEqual({ kind: "upToDate" });
    updates.flags.isUpdatePending = true;
    rerender();
    expect(result.current.state).toEqual({ kind: "ready" });
  });

  it("offers the restart again after a failed reload", async () => {
    updates.flags.isUpdatePending = true;
    updates.reloadAsync.mockRejectedValue(new Error("no runtime"));
    const { result } = renderHook(() => useAppUpdate("#fff", "#000"));
    expect(result.current.state).toEqual({ kind: "ready" });
    await act(() => result.current.act());
    expect(result.current.state).toEqual({ kind: "failed", at: "restart" });
    expect(captureError).toHaveBeenCalledWith(
      "update_restart_failed",
      expect.any(Error),
    );
    // The retry restarts again rather than starting a new check.
    updates.reloadAsync.mockResolvedValue(undefined);
    await act(() => result.current.act());
    expect(updates.reloadAsync).toHaveBeenCalledTimes(2);
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });
});
