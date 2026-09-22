// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAnalyticsIdentity } from "./analytics-identity";

const mock = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  isFetching: false,
  user: undefined as { _id: string } | undefined,
  identify: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  resetIfIdentified: vi.fn(),
  removeQueries: vi.fn(),
  clearRecentSavesWidget: vi.fn(() => Promise.resolve(true)),
  retryPendingWidgetClear: vi.fn(() => Promise.resolve(true)),
  platform: "ios",
  appStateListeners: new Set<(state: string) => void>(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.platform;
    },
  },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mock.appStateListeners.add(listener);
      return { remove: () => mock.appStateListeners.delete(listener) };
    },
  },
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mock.isAuthenticated,
    isLoading: mock.isLoading,
  }),
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user, isFetching: mock.isFetching }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    identify: mock.identify,
    capture: mock.capture,
    captureError: mock.captureError,
    resetIfIdentified: mock.resetIfIdentified,
  },
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { removeQueries: mock.removeQueries },
}));
vi.mock("@/lib/widget-sync", () => ({
  clearRecentSavesWidget: mock.clearRecentSavesWidget,
  retryPendingWidgetClear: mock.retryPendingWidgetClear,
}));

describe("useAnalyticsIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.isAuthenticated = false;
    mock.isLoading = false;
    mock.isFetching = false;
    mock.user = undefined;
    mock.platform = "ios";
  });

  it("does nothing while Convex Auth restores the stored token", () => {
    mock.isLoading = true;
    renderHook(() => useAnalyticsIdentity());
    expect(mock.resetIfIdentified).not.toHaveBeenCalled();
    expect(mock.removeQueries).not.toHaveBeenCalled();
    expect(mock.identify).not.toHaveBeenCalled();
    expect(mock.clearRecentSavesWidget).not.toHaveBeenCalled();
  });

  it("retries failed clearing on foreground without clearing queries again", async () => {
    mock.clearRecentSavesWidget.mockRejectedValueOnce(new Error("unavailable"));
    renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.capture).not.toHaveBeenCalledWith("widget_cleared");
    await act(async () => {
      for (const listener of mock.appStateListeners) listener("active");
    });
    expect(mock.retryPendingWidgetClear).toHaveBeenCalledOnce();
    expect(mock.removeQueries).toHaveBeenCalledOnce();
    expect(mock.capture).toHaveBeenCalledWith("widget_cleared");
    await act(async () => {
      for (const listener of mock.appStateListeners) listener("active");
    });
    expect(mock.retryPendingWidgetClear).toHaveBeenCalledOnce();
  });

  it("joins pending cleanup at sign-in and retries failed cleanup on foreground", async () => {
    let reject!: (error: Error) => void;
    mock.clearRecentSavesWidget.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const hook = renderHook(() => useAnalyticsIdentity());
    await act(async () => {
      for (const listener of mock.appStateListeners) listener("active");
    });
    expect(mock.clearRecentSavesWidget).toHaveBeenCalledOnce();
    mock.isAuthenticated = true;
    mock.retryPendingWidgetClear.mockRejectedValueOnce(
      new Error("unavailable"),
    );
    hook.rerender();
    await act(async () => {
      reject(new Error("unavailable"));
    });
    await act(async () => {
      for (const listener of mock.appStateListeners) listener("active");
    });
    expect(mock.clearRecentSavesWidget).toHaveBeenCalledOnce();
    expect(mock.retryPendingWidgetClear).toHaveBeenCalledTimes(2);
    expect(mock.appStateListeners.size).toBe(1);
    expect(mock.capture).not.toHaveBeenCalledWith("widget_cleared");
  });

  it("does not start or retry widget cleanup on Android", async () => {
    mock.platform = "android";
    renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.clearRecentSavesWidget).not.toHaveBeenCalled();
    expect(mock.retryPendingWidgetClear).not.toHaveBeenCalled();
    expect(mock.appStateListeners.size).toBe(0);
  });

  it("reports known cleanup failures with a safe category", async () => {
    mock.clearRecentSavesWidget.mockRejectedValueOnce(
      new Error("widget_thumbnail_cleanup_failed"),
    );
    renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.captureError).toHaveBeenCalledWith(
      "widget_thumbnail_cleanup_failed",
      new Error("widget_thumbnail_cleanup_failed"),
    );
  });

  it("does not attribute a late signed-out success to the new account", async () => {
    let resolve!: (result: boolean) => void;
    mock.clearRecentSavesWidget.mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const hook = renderHook(() => useAnalyticsIdentity());
    mock.isAuthenticated = true;
    hook.rerender();
    await act(async () => {
      resolve(true);
    });
    expect(mock.capture).not.toHaveBeenCalledWith("widget_cleared");
  });

  it("resets analytics and clears only Convex cache entries when signed out", () => {
    renderHook(() => useAnalyticsIdentity());
    expect(mock.resetIfIdentified).toHaveBeenCalledOnce();
    expect(mock.removeQueries).toHaveBeenCalledOnce();
    const { predicate } = mock.removeQueries.mock.calls[0][0] as {
      predicate: (query: { queryKey: unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: ["convexQuery"] })).toBe(true);
    expect(predicate({ queryKey: ["otherKey"] })).toBe(false);
    expect(mock.identify).not.toHaveBeenCalled();
  });

  it("clears the Home Screen widget and records the boundary when signed out", async () => {
    renderHook(() => useAnalyticsIdentity());
    expect(mock.clearRecentSavesWidget).toHaveBeenCalledOnce();
    // The capture waits for the async clear to resolve.
    await act(async () => {});
    expect(mock.capture).toHaveBeenCalledWith("widget_cleared");
  });

  it("does not record the boundary when there is no widget to clear", async () => {
    // A non-iOS or old client clears nothing, so the boundary is not recorded.
    mock.clearRecentSavesWidget.mockResolvedValueOnce(false);
    renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.capture).not.toHaveBeenCalledWith("widget_cleared");
  });

  it("handles a failed clear without reporting success or exposing native errors", async () => {
    mock.clearRecentSavesWidget.mockRejectedValueOnce(
      new Error("private native file path"),
    );
    renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.removeQueries).toHaveBeenCalledOnce();
    expect(mock.capture).not.toHaveBeenCalledWith("widget_cleared");
    expect(mock.captureError).toHaveBeenCalledWith(
      "widget_clear_failed",
      new Error("widget_clear_failed"),
    );
  });

  it("clears the Convex cache again after a later sign-out", () => {
    const hook = renderHook(() => useAnalyticsIdentity());
    mock.isAuthenticated = true;
    mock.user = { _id: "user_1" };
    hook.rerender();
    mock.isAuthenticated = false;
    mock.user = undefined;
    hook.rerender();
    expect(mock.removeQueries).toHaveBeenCalledTimes(2);
  });

  it("resets through the conditional path when signing out before the user query resolved", () => {
    // The one case where the retired unconditional reset diverged: nothing
    // was ever identified, so there is no link to break and the anonymous
    // id (and the onboarding funnel on it) must survive. Only the
    // conditional reset may run, and it must not be paired with an identify.
    mock.isAuthenticated = true;
    mock.isFetching = true;
    mock.user = undefined;
    const hook = renderHook(() => useAnalyticsIdentity());
    expect(mock.identify).not.toHaveBeenCalled();
    expect(mock.resetIfIdentified).not.toHaveBeenCalled();

    mock.isAuthenticated = false;
    mock.isFetching = false;
    hook.rerender();
    expect(mock.identify).not.toHaveBeenCalled();
    expect(mock.resetIfIdentified).toHaveBeenCalledOnce();
    expect(mock.removeQueries).toHaveBeenCalledOnce();
  });

  it("resets when the session expires without a user action", async () => {
    // Convex reports an expired session as the same unauthenticated edge as
    // an explicit sign-out. The retired device-session reset never covered
    // this path; the auth edge does.
    mock.isAuthenticated = true;
    mock.user = { _id: "user_1" };
    const hook = renderHook(() => useAnalyticsIdentity());
    await act(async () => {});
    expect(mock.identify).toHaveBeenCalledWith("user_1");

    mock.isAuthenticated = false;
    mock.user = undefined;
    hook.rerender();
    expect(mock.resetIfIdentified).toHaveBeenCalledOnce();
    expect(mock.removeQueries).toHaveBeenCalledOnce();
  });

  it("re-identifies a different account after the reset", async () => {
    // Account switch on one device: reset on the edge, then a fresh identify
    // for the new user id once its record is fetched.
    mock.isAuthenticated = true;
    mock.user = { _id: "user_1" };
    const hook = renderHook(() => useAnalyticsIdentity());
    await act(async () => {});

    mock.isAuthenticated = false;
    mock.user = undefined;
    hook.rerender();

    mock.isAuthenticated = true;
    mock.user = { _id: "user_2" };
    hook.rerender();
    await act(async () => {});
    expect(mock.resetIfIdentified).toHaveBeenCalledOnce();
    expect(mock.identify).toHaveBeenNthCalledWith(1, "user_1");
    expect(mock.identify).toHaveBeenNthCalledWith(2, "user_2");
    expect(mock.identify).toHaveBeenCalledTimes(2);
  });

  it("identifies once per account once the user query reconnects", async () => {
    mock.isAuthenticated = true;
    mock.isFetching = true;
    mock.user = { _id: "user_1" };
    const hook = renderHook(() => useAnalyticsIdentity());
    expect(mock.identify).not.toHaveBeenCalled();
    mock.isFetching = false;
    hook.rerender();
    await act(async () => {});
    expect(mock.identify).toHaveBeenCalledWith("user_1");
    expect(mock.capture).toHaveBeenCalledWith("auth_completed");
    hook.rerender();
    await act(async () => {});
    expect(mock.identify).toHaveBeenCalledOnce();
  });

  it("identifies only after a pending sign-out reset settles", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mock.resetIfIdentified.mockReturnValue(gate);
    mock.isAuthenticated = false;
    const hook = renderHook(() => useAnalyticsIdentity());
    mock.isAuthenticated = true;
    mock.isFetching = false;
    mock.user = { _id: "user_1" };
    hook.rerender();
    await act(async () => {});
    // The reset is still pending: identifying now would let its deferred
    // continuation wipe the new identity.
    expect(mock.identify).not.toHaveBeenCalled();
    release();
    await act(async () => {});
    expect(mock.identify).toHaveBeenCalledWith("user_1");
  });

  it("does not identify without a fetched user record", () => {
    mock.isAuthenticated = true;
    mock.isFetching = false;
    mock.user = undefined;
    renderHook(() => useAnalyticsIdentity());
    expect(mock.identify).not.toHaveBeenCalled();
    expect(mock.capture).not.toHaveBeenCalled();
  });
});
