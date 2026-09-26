// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import {
  NotificationSessionProvider,
  useNotificationObserver,
  useNotificationSession,
} from "./notifications";

const mock = vi.hoisted(() => ({
  authenticated: true,
  locale: "en",
  token: vi.fn(),
  register: vi.fn(),
  otherMutation: vi.fn(),
  signOut: vi.fn(),
  clearWidget: vi.fn(async () => true),
  captureError: vi.fn(),
  capture: vi.fn(),
  push: vi.fn(),
  lastResponse: null as null | { notification: unknown },
  appState: null as null | ((state: string) => void),
  rotated: null as null | ((token: { type: string; data: string }) => void),
}));
vi.mock("@/lib/i18n", () => ({
  currentLocale: () => mock.locale,
  useAppLocale: () => mock.locale,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError, capture: mock.capture },
}));
vi.mock("./notification-token", () => ({ getExpoPushToken: mock.token }));
vi.mock("@/lib/widget-sync", () => ({
  clearRecentSavesWidget: mock.clearWidget,
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    notifications: {
      registerDevice: "register",
      unregisterDevice: "unregister",
      setPreferences: "preferences",
    },
    users: { deleteCurrentUserAccount: "delete" },
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
  useMutation: (ref: string) =>
    ref === "register" ? mock.register : mock.otherMutation,
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: mock.signOut }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => "[]",
  setItemAsync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: {
    addEventListener: (_event: string, listener: typeof mock.appState) => {
      mock.appState = listener;
      return {
        remove: () => {
          mock.appState = null;
        },
      };
    },
  },
}));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getLastNotificationResponse: () => mock.lastResponse,
  clearLastNotificationResponse: () => {
    mock.lastResponse = null;
  },
  addNotificationResponseReceivedListener: () => ({ remove: vi.fn() }),
  addPushTokenListener: (listener: typeof mock.rotated) => {
    mock.rotated = listener;
    return {
      remove: () => {
        mock.rotated = null;
      },
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.authenticated = true;
  mock.locale = "en";
  mock.lastResponse = null;
  mock.token.mockReset().mockResolvedValue("expo-token");
  mock.register.mockReset().mockResolvedValue(undefined);
});

function renderSession() {
  return renderHook(() => useNotificationSession(), {
    wrapper: NotificationSessionProvider,
  });
}

describe("notification session lifecycle", () => {
  it("reports the safe file-cleanup category from account deletion", async () => {
    mock.clearWidget.mockRejectedValueOnce(
      new Error("widget_thumbnail_cleanup_failed"),
    );
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    await act(async () => {
      await result.current.session.deleteAccount();
    });
    expect(mock.captureError).toHaveBeenCalledWith(
      "widget_thumbnail_cleanup_failed",
      new Error("widget_thumbnail_cleanup_failed"),
    );
  });
  it("clears the widget after successful server account deletion", async () => {
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    await act(async () => {
      await result.current.session.deleteAccount();
    });
    expect(mock.clearWidget).toHaveBeenCalledOnce();
    expect(mock.signOut).toHaveBeenCalledOnce();
  });
  it("does not repeat token requests or server mutations on foreground after ownership rejection", async () => {
    mock.register.mockRejectedValueOnce(
      new ConvexError({ code: "notification_token_owned_by_another_account" }),
    );
    renderSession();
    await waitFor(() => expect(mock.captureError).toHaveBeenCalledTimes(1));
    await act(async () => {
      mock.appState?.("active");
      mock.appState?.("active");
    });
    expect(mock.token).toHaveBeenCalledTimes(1);
    expect(mock.register).toHaveBeenCalledTimes(1);
    expect(mock.captureError).toHaveBeenCalledTimes(1);
  });

  it("retries a transient server failure on foreground", async () => {
    mock.register.mockRejectedValueOnce(new Error("temporarily unavailable"));
    renderSession();
    await waitFor(() => expect(mock.captureError).toHaveBeenCalledTimes(1));
    act(() => mock.appState?.("active"));
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(2));
  });
  it("registers only once at startup and updates a changed locale", async () => {
    const { rerender } = renderSession();
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
    expect(mock.token).toHaveBeenCalledTimes(1);
    mock.locale = "ja";
    rerender();
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(2));
    expect(mock.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: "ja" }),
    );
  });

  it("reports a startup failure once and retries on foreground", async () => {
    mock.token.mockRejectedValueOnce(new Error("offline"));
    renderSession();
    await waitFor(() => expect(mock.captureError).toHaveBeenCalledTimes(1));
    expect(mock.token).toHaveBeenCalledTimes(1);
    act(() => mock.appState?.("active"));
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
  });

  it("does not fetch a token again on foreground after successful registration", async () => {
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    act(() => mock.appState?.("active"));
    act(() => mock.appState?.("active"));
    expect(mock.token).toHaveBeenCalledTimes(1);
  });

  it("reports a locale failure distinctly and retries it on foreground", async () => {
    const { rerender, result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    mock.token.mockRejectedValueOnce(new Error("offline"));
    mock.locale = "ja";
    rerender();
    await waitFor(() =>
      expect(mock.captureError).toHaveBeenCalledWith(
        "notification_locale_sync_failed",
        expect.any(Error),
      ),
    );
    act(() => mock.appState?.("active"));
    await waitFor(() =>
      expect(mock.register).toHaveBeenLastCalledWith(
        expect.objectContaining({ locale: "ja" }),
      ),
    );
  });

  it("registers permission granted in Settings on return to the app", async () => {
    mock.token.mockResolvedValueOnce(null);
    renderSession();
    await waitFor(() => expect(mock.token).toHaveBeenCalledTimes(1));
    expect(mock.register).not.toHaveBeenCalled();
    act(() => mock.appState?.("active"));
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
  });

  it("registers rotated tokens and stops listeners after sign-out", async () => {
    const { rerender } = renderSession();
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
    const token = { type: "android", data: "new-token" };
    mock.token.mockResolvedValueOnce("new-expo-token");
    act(() => mock.rotated?.(token));
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(2));
    expect(mock.token).toHaveBeenLastCalledWith(false, token);
    mock.authenticated = false;
    rerender();
    expect(mock.appState).toBeNull();
    expect(mock.rotated).toBeNull();
  });
});

const opened = (data: Record<string, unknown>) => ({
  notification: { request: { content: { data } } },
});

describe("notification opens", () => {
  it("records the kind and id before navigating", () => {
    mock.lastResponse = opened({
      url: "/digest/abc",
      kind: "weekly_shelf",
      notificationId: "abc",
    });
    renderHook(() => useNotificationObserver());
    expect(mock.capture).toHaveBeenCalledWith("notification_opened", {
      notification_kind: "weekly_shelf",
      notification_id: "abc",
    });
    expect(mock.push).toHaveBeenCalledWith("/digest/abc");
  });

  // Installed builds keep receiving payloads from the currently deployed
  // backend until it ships, and those carry a url and nothing else.
  it("still records an open for a payload that predates the kind field", () => {
    mock.lastResponse = opened({ url: "/digest/abc" });
    renderHook(() => useNotificationObserver());
    expect(mock.capture).toHaveBeenCalledWith("notification_opened", {
      notification_kind: "unknown",
      notification_id: "",
    });
    expect(mock.push).toHaveBeenCalledWith("/digest/abc");
  });

  it("handles a tap once, however often the observer remounts", () => {
    mock.lastResponse = opened({
      url: "/item/abc",
      kind: "read_reminder",
      notificationId: "r1",
    });
    renderHook(() => useNotificationObserver()).unmount();
    renderHook(() => useNotificationObserver());
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.push).toHaveBeenCalledTimes(1);
    expect(mock.lastResponse).toBeNull();
  });

  it("records nothing when a notification carries no destination", () => {
    mock.lastResponse = opened({ kind: "weekly_shelf" });
    renderHook(() => useNotificationObserver());
    expect(mock.capture).not.toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
  });
});
