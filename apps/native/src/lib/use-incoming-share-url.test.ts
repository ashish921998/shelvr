// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSharePayload } from "@/lib/share/storage";
import {
  SHARE_SHEET_DISMISS_MS,
  decideShareIntake,
  useIncomingShareUrl,
} from "./use-incoming-share-url";

const mock = vi.hoisted(() => ({
  payloads: [] as { value: string; shareType: string }[],
  getSharedPayloads: vi.fn(),
  clearSharedPayloads: vi.fn(),
  markPendingShareOnDevice: vi.fn(),
  captureError: vi.fn(),
  share: vi.fn(),
  appStateListener: null as null | ((state: string) => void),
  urlListener: null as null | ((event: { url: string }) => void),
}));

vi.mock("expo-sharing", () => ({
  getSharedPayloads: mock.getSharedPayloads,
  clearSharedPayloads: mock.clearSharedPayloads,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  markPendingShareOnDevice: mock.markPendingShareOnDevice,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: mock.captureError },
}));
vi.mock("react-native", () => ({
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
  Share: { share: mock.share, sharedAction: "sharedAction" },
}));

const link = (value: string): RawSharePayload => ({ value, shareType: "url" });

function renderShare({
  accepting = true,
  readOnMount = true,
}: { accepting?: boolean; readOnMount?: boolean } = {}) {
  const onSharedUrl = vi.fn();
  const onDirectUrl = vi.fn();
  const onError = vi.fn();
  const canAccept = vi.fn(() => accepting);
  const hook = renderHook(() =>
    useIncomingShareUrl({
      canAccept,
      readOnMount,
      onSharedUrl,
      onDirectUrl,
      onError,
    }),
  );
  return { ...hook, onSharedUrl, onDirectUrl, onError, canAccept };
}

beforeEach(() => {
  mock.payloads = [];
  mock.getSharedPayloads.mockReset().mockImplementation(() => mock.payloads);
  mock.clearSharedPayloads.mockReset();
  mock.markPendingShareOnDevice.mockReset();
  mock.captureError.mockReset();
  mock.share.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("decideShareIntake", () => {
  it.each([
    ["nothing shared", [], true, { kind: "none" }],
    [
      "one link while accepting",
      [link(" https://a.test/x ")],
      true,
      { kind: "consume", url: "https://a.test/x" },
    ],
    [
      "one link after the demo moved on",
      [link("https://a.test")],
      false,
      {
        kind: "hold",
      },
    ],
    [
      "several payloads",
      [link("https://a.test"), link("https://b.test")],
      true,
      { kind: "hold" },
    ],
    [
      "a lone note",
      [{ value: "just words", shareType: "text" }],
      true,
      { kind: "hold" },
    ],
    [
      "a lone image",
      [{ value: "ph://IMG_1", shareType: "image" }],
      true,
      { kind: "hold" },
    ],
  ])("%s", (_, payloads, accepting, expected) => {
    expect(decideShareIntake(payloads, accepting)).toEqual(expected);
  });
});

describe("useIncomingShareUrl", () => {
  it("saves a single shared link on mount and clears it", () => {
    mock.payloads = [link("https://a.test/x")];
    const { onSharedUrl } = renderShare();
    expect(onSharedUrl).toHaveBeenCalledWith("https://a.test/x");
    expect(mock.clearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(mock.markPendingShareOnDevice).not.toHaveBeenCalled();
  });

  it("leaves a share for the share screen once the demo moved on", () => {
    mock.payloads = [link("https://a.test/x")];
    const { onSharedUrl } = renderShare({ accepting: false });
    expect(onSharedUrl).not.toHaveBeenCalled();
    expect(mock.clearSharedPayloads).not.toHaveBeenCalled();
    expect(mock.markPendingShareOnDevice).toHaveBeenCalledTimes(1);
  });

  it("leaves a multi-item share untouched and flags it", () => {
    const { onSharedUrl } = renderShare({ readOnMount: false });
    expect(mock.getSharedPayloads).not.toHaveBeenCalled();

    mock.payloads = [link("https://a.test"), link("https://b.test")];
    act(() => mock.urlListener?.({ url: "shelvr://expo-sharing" }));
    expect(onSharedUrl).not.toHaveBeenCalled();
    expect(mock.clearSharedPayloads).not.toHaveBeenCalled();
    expect(mock.markPendingShareOnDevice).toHaveBeenCalledTimes(1);
  });

  it("reads again when the app returns to the foreground", () => {
    const { onSharedUrl, canAccept } = renderShare({ readOnMount: false });
    mock.payloads = [link("https://a.test/x")];
    act(() => mock.appStateListener?.("background"));
    expect(onSharedUrl).not.toHaveBeenCalled();
    act(() => mock.appStateListener?.("active"));
    expect(canAccept).toHaveBeenCalled();
    expect(onSharedUrl).toHaveBeenCalledWith("https://a.test/x");
  });

  it("does nothing when nothing was shared", () => {
    const { onSharedUrl } = renderShare();
    expect(onSharedUrl).not.toHaveBeenCalled();
    expect(mock.markPendingShareOnDevice).not.toHaveBeenCalled();
  });

  it("survives a failed read or a failed flag", () => {
    mock.getSharedPayloads.mockImplementationOnce(() => {
      throw new Error("read");
    });
    const { onSharedUrl } = renderShare();
    expect(onSharedUrl).not.toHaveBeenCalled();
    expect(mock.captureError).toHaveBeenCalledWith(
      "onboarding_share_read_failed",
      expect.any(Error),
    );

    mock.payloads = [link("https://a.test"), link("https://b.test")];
    mock.markPendingShareOnDevice.mockImplementationOnce(() => {
      throw new Error("store");
    });
    act(() => mock.appStateListener?.("active"));
    expect(mock.captureError).toHaveBeenCalledWith(
      "onboarding_hold_share_failed",
      expect.any(Error),
    );
  });

  describe("shareSample", () => {
    async function runSample(
      result: { action: string; activityType?: string },
      payloads: RawSharePayload[],
    ) {
      vi.useFakeTimers();
      mock.share.mockResolvedValue(result);
      const hook = renderShare({ readOnMount: false });
      let done!: Promise<void>;
      act(() => {
        done = hook.result.current.shareSample("https://sample.test/a");
      });
      expect(hook.result.current.shareSheetOpen).toBe(true);
      mock.payloads = payloads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SHARE_SHEET_DISMISS_MS);
        await done;
      });
      expect(hook.result.current.shareSheetOpen).toBe(false);
      return hook;
    }

    it("saves the link Shelvr received", async () => {
      const { onSharedUrl, onDirectUrl } = await runSample(
        { action: "sharedAction" },
        [link("https://sample.test/a")],
      );
      expect(onSharedUrl).toHaveBeenCalledWith("https://sample.test/a");
      expect(onDirectUrl).not.toHaveBeenCalled();
      expect(mock.clearSharedPayloads).toHaveBeenCalledTimes(1);
    });

    it("falls back to the sample when the extension's payload is not readable", async () => {
      const { onSharedUrl, onDirectUrl } = await runSample(
        {
          action: "sharedAction",
          activityType: "app.shelvr.save.expo-sharing-extension",
        },
        [],
      );
      expect(onSharedUrl).toHaveBeenCalledWith("https://sample.test/a");
      expect(onDirectUrl).not.toHaveBeenCalled();
    });

    it("asks for Shelvr when another app was picked", async () => {
      const { onSharedUrl, onDirectUrl, onError } = await runSample(
        {
          action: "sharedAction",
          activityType: "com.apple.UIKit.activity.CopyToPasteboard",
        },
        [],
      );
      expect(onSharedUrl).not.toHaveBeenCalled();
      expect(onDirectUrl).not.toHaveBeenCalled();
      expect(onError).toHaveBeenLastCalledWith("demo.pickShelvr");
    });

    it("does nothing when the sheet was dismissed", async () => {
      const { onSharedUrl, onDirectUrl, onError } = await runSample(
        { action: "dismissedAction" },
        [],
      );
      expect(onSharedUrl).not.toHaveBeenCalled();
      expect(onDirectUrl).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(null);
    });

    it("saves the sample directly when the sheet cannot open", async () => {
      mock.share.mockRejectedValue(new Error("sheet"));
      const { result, onSharedUrl, onDirectUrl } = renderShare({
        readOnMount: false,
      });
      await act(() => result.current.shareSample("https://sample.test/a"));
      expect(onSharedUrl).not.toHaveBeenCalled();
      expect(onDirectUrl).toHaveBeenCalledWith("https://sample.test/a");
      expect(result.current.shareSheetOpen).toBe(false);
    });
  });
});
