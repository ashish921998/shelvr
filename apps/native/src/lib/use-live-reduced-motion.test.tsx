// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useLiveReducedMotion } from "./use-live-reduced-motion";

const mock = vi.hoisted(() => ({
  read: vi.fn<() => Promise<boolean>>(),
  remove: vi.fn(),
  captureError: vi.fn(),
  listener: undefined as ((enabled: boolean) => void) | undefined,
}));

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: mock.read,
    addEventListener: vi.fn((_, listener: (enabled: boolean) => void) => {
      mock.listener = listener;
      return { remove: mock.remove };
    }),
  },
}));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.listener = undefined;
  mock.read.mockResolvedValue(false);
});

it("reads a preference changed since app launch and follows later changes", async () => {
  mock.read.mockResolvedValue(true);
  const { result } = renderHook(useLiveReducedMotion);
  await waitFor(() => expect(result.current).toBe(true));
  act(() => mock.listener?.(false));
  expect(result.current).toBe(false);
  act(() => mock.listener?.(true));
  expect(result.current).toBe(true);
});

it("does not let a delayed initial read overwrite a newer change", async () => {
  let finishRead: (enabled: boolean) => void = () => {};
  mock.read.mockReturnValue(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  const { result } = renderHook(useLiveReducedMotion);
  act(() => mock.listener?.(true));
  await act(async () => finishRead(false));
  expect(result.current).toBe(true);
});

it("removes its subscription and ignores an initial read after unmount", async () => {
  let finishRead: (enabled: boolean) => void = () => {};
  mock.read.mockReturnValue(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  const { result, unmount } = renderHook(useLiveReducedMotion);
  unmount();
  expect(mock.remove).toHaveBeenCalledOnce();
  await act(async () => finishRead(true));
  expect(result.current).toBe(false);
});

it("reports a failed read while continuing to observe preference changes", async () => {
  const error = new Error("Native preference unavailable");
  mock.read.mockRejectedValue(error);
  const { result } = renderHook(useLiveReducedMotion);
  await waitFor(() =>
    expect(mock.captureError).toHaveBeenCalledWith(
      "reduced_motion_read_failed",
      error,
    ),
  );
  act(() => mock.listener?.(true));
  expect(result.current).toBe(true);
});
