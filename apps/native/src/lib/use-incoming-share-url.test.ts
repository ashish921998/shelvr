// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSharePayload } from "@/lib/share/storage";
import {
  decideShareIntake,
  holdsOnlyLink,
  releaseSavedShare,
  useIncomingShareUrl,
} from "./use-incoming-share-url";

const mock = vi.hoisted(() => ({
  payloads: [] as { value: string; shareType: string }[],
  getSharedPayloads: vi.fn(),
  clearSharedPayloads: vi.fn(),
  markPendingShareOnDevice: vi.fn(),
  clearPendingShareOnDevice: vi.fn(),
  captureError: vi.fn(),
  capture: vi.fn(),
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
  clearPendingShareOnDevice: mock.clearPendingShareOnDevice,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: mock.capture,
    captureError: mock.captureError,
  },
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
  const canAccept = vi.fn(() => accepting);
  const hook = renderHook(() =>
    useIncomingShareUrl({ canAccept, readOnMount, onSharedUrl }),
  );
  return { ...hook, onSharedUrl, canAccept };
}

beforeEach(() => {
  mock.payloads = [];
  mock.getSharedPayloads.mockReset().mockImplementation(() => mock.payloads);
  // An empty read forgets the link the hook last handed over.
  renderShare().unmount();
  mock.getSharedPayloads.mockClear();
  mock.clearSharedPayloads.mockReset();
  mock.markPendingShareOnDevice.mockReset();
  mock.captureError.mockReset();
  mock.capture.mockReset();
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
  it("hands a single shared link to the demo and keeps holding it", () => {
    mock.payloads = [link("https://a.test/x")];
    const { onSharedUrl } = renderShare();
    expect(onSharedUrl).toHaveBeenCalledWith("https://a.test/x");
    // Nothing is cleared until the server says this link was saved.
    expect(mock.clearSharedPayloads).not.toHaveBeenCalled();
    expect(mock.markPendingShareOnDevice).not.toHaveBeenCalled();
  });

  it("hands the same held link over once, across foregrounds and remounts", () => {
    mock.payloads = [link("https://a.test/x")];
    const first = renderShare();
    act(() => mock.appStateListener?.("active"));
    expect(first.onSharedUrl).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderShare();
    expect(second.onSharedUrl).not.toHaveBeenCalled();

    // A different link shared afterwards is a new share.
    mock.payloads = [link("https://b.test/y")];
    act(() => mock.appStateListener?.("active"));
    expect(second.onSharedUrl).toHaveBeenCalledWith("https://b.test/y");
  });

  it("lets go of a held link only once that link is the one saved", () => {
    mock.payloads = [link("https://mine.test/new")];
    releaseSavedShare("https://sample.test/old-demo");
    expect(mock.clearSharedPayloads).not.toHaveBeenCalled();

    releaseSavedShare("https://mine.test/new");
    expect(mock.clearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(mock.clearPendingShareOnDevice).toHaveBeenCalledTimes(1);
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
});

describe("holdsOnlyLink", () => {
  const practice = "https://sample.test/practice";

  it.each([
    ["the practice link alone", [link(practice)], true],
    ["nothing", [], false],
    ["the user's own link in its place", [link("https://mine.test")], false],
    [
      "the practice link beside the user's own",
      [link(practice), link("https://mine.test")],
      false,
    ],
    ["a photo", [{ value: "ph://IMG_1", shareType: "image" }], false],
  ])("%s", (_, payloads, expected) => {
    expect(holdsOnlyLink(payloads, practice)).toBe(expected);
  });
});
