// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_SHEET_DISMISS_MS,
  presentShareSheet,
  useShareArrival,
} from "./share-sheet";

const mock = vi.hoisted(() => ({
  os: "ios",
  share: vi.fn(),
  captureError: vi.fn(),
  appStateListener: null as null | ((state: string) => void),
  urlListener: null as null | ((event: { url: string }) => void),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
  Share: { share: mock.share, sharedAction: "sharedAction" },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      mock.appStateListener = listener;
      return { remove: () => (mock.appStateListener = null) };
    },
  },
  Linking: {
    addEventListener: (_: string, listener: (e: { url: string }) => void) => {
      mock.urlListener = listener;
      return { remove: () => (mock.urlListener = null) };
    },
  },
}));

beforeEach(() => {
  mock.os = "ios";
  mock.share.mockReset();
  mock.captureError.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function present(
  result: { action: string; activityType?: string },
  arrived = false,
) {
  mock.share.mockResolvedValue(result);
  const done = presentShareSheet("https://sample.test/a", () => arrived);
  await vi.advanceTimersByTimeAsync(SHARE_SHEET_DISMISS_MS);
  return done;
}

describe("presentShareSheet", () => {
  it("shares a URL on iOS and a message on Android", async () => {
    await present({ action: "dismissedAction" });
    expect(mock.share).toHaveBeenLastCalledWith({
      url: "https://sample.test/a",
    });
    mock.os = "android";
    await present({ action: "dismissedAction" });
    expect(mock.share).toHaveBeenLastCalledWith({
      message: "https://sample.test/a",
    });
  });

  it.each([
    ["a payload arrived", { action: "sharedAction" }, true, "shelvr"],
    [
      "the Shelvr extension took it",
      {
        action: "sharedAction",
        activityType: "app.shelvr.save.expo-sharing-extension",
      },
      false,
      "shelvr",
    ],
    [
      "another app took it",
      { action: "sharedAction", activityType: "com.apple.UIKit.activity.Mail" },
      false,
      "other_app",
    ],
    ["the sheet was closed", { action: "dismissedAction" }, false, "dismissed"],
  ])("iOS: %s", async (_, result, arrived, expected) => {
    expect(await present(result, arrived)).toBe(expected);
  });

  it("cannot name the receiving app on Android", async () => {
    mock.os = "android";
    expect(await present({ action: "sharedAction" })).toBe("sent");
  });

  it("reports a sheet that failed to open", async () => {
    mock.share.mockRejectedValue(new Error("busy"));
    expect(await presentShareSheet("https://sample.test/a", () => false)).toBe(
      "failed",
    );
    expect(mock.captureError).toHaveBeenCalledWith(
      "onboarding_share_sheet_failed",
      expect.any(Error),
    );
  });
});

describe("useShareArrival", () => {
  it("checks on mount when asked, on foreground, and on a share link", () => {
    const onArrive = vi.fn();
    const { unmount } = renderHook(() => useShareArrival(onArrive, true));
    expect(onArrive).toHaveBeenCalledTimes(1);

    act(() => mock.appStateListener?.("background"));
    act(() => mock.urlListener?.({ url: "shelvr://other" }));
    expect(onArrive).toHaveBeenCalledTimes(1);

    act(() => mock.appStateListener?.("active"));
    act(() => mock.urlListener?.({ url: "shelvr://expo-sharing" }));
    expect(onArrive).toHaveBeenCalledTimes(3);

    unmount();
    expect(mock.appStateListener).toBeNull();
    expect(mock.urlListener).toBeNull();
  });
});
