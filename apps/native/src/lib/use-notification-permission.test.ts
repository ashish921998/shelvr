// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useNotificationPermission } from "./use-notification-permission";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  captureError: vi.fn(),
  listeners: [] as ((state: string) => void)[],
  remove: vi.fn(),
}));

vi.mock("./notification-token", () => ({
  notificationPermissionState: mocks.state,
}));
vi.mock("./analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.listeners.push(listener);
      return { remove: mocks.remove };
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.length = 0;
});

it("reads the permission again when the app comes back from Settings", async () => {
  mocks.state.mockResolvedValueOnce("granted").mockResolvedValueOnce("blocked");
  const { result, unmount } = renderHook(() => useNotificationPermission());
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current).toBe("granted"));

  act(() => mocks.listeners.forEach((listener) => listener("background")));
  expect(mocks.state).toHaveBeenCalledTimes(1);

  act(() => mocks.listeners.forEach((listener) => listener("active")));
  await waitFor(() => expect(result.current).toBe("blocked"));

  unmount();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});

it("reports a failed read and leaves the state unknown", async () => {
  mocks.state.mockRejectedValue(new Error("native module missing"));
  const { result } = renderHook(() => useNotificationPermission());
  await waitFor(() =>
    expect(mocks.captureError).toHaveBeenCalledWith(
      "notification_permission_read_failed",
      expect.any(Error),
    ),
  );
  expect(result.current).toBeUndefined();
});
