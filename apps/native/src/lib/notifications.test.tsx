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
  timezone: "Europe/Berlin",
  token: vi.fn(),
  register: vi.fn(),
  otherMutation: vi.fn(),
  signOut: vi.fn(),
  clearWidget: vi.fn(async () => true),
  revokeSiri: vi.fn(async () => {}),
  clearFirstSave: vi.fn(async () => {}),
  clearTrial: vi.fn(async () => {}),
  captureError: vi.fn(),
  capture: vi.fn(),
  push: vi.fn(),
  lastResponse: null as null | { notification: unknown },
  appState: null as null | ((state: string) => void),
  tapped: null as null | ((response: unknown) => void),
  rotated: null as null | ((token: { type: string; data: string }) => void),
}));
vi.mock("@/lib/i18n", () => ({
  currentLocale: () => mock.locale,
  useAppLocale: () => mock.locale,
}));
vi.mock("expo-localization", () => ({
  getCalendars: () => [{ timeZone: mock.timezone }],
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError, capture: mock.capture },
}));
vi.mock("./notification-token", () => ({ getExpoPushToken: mock.token }));
vi.mock("@/lib/exit-offer-reminder", () => ({
  clearExitOfferReminder: vi.fn(async () => {}),
}));
vi.mock("@/lib/first-save-reminder", () => ({
  clearFirstSaveReminder: mock.clearFirstSave,
}));
vi.mock("@/lib/trial-reminder", () => ({
  clearTrialReminder: mock.clearTrial,
}));
vi.mock("@/lib/widget-sync", () => ({
  clearRecentSavesWidget: mock.clearWidget,
}));
vi.mock("@/lib/app-intents", () => ({
  revokeSiriCapture: mock.revokeSiri,
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    notifications: {
      registerDevice: "register",
      unregisterDevice: "unregister",
      setPreferences: "preferences",
    },
    users: { deleteCurrentUserAccount: "delete" },
    appIntents: { revokeCaptureToken: "revokeCapture" },
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
  addNotificationResponseReceivedListener: (listener: typeof mock.tapped) => {
    mock.tapped = listener;
    return { remove: vi.fn() };
  },
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
  mock.timezone = "Europe/Berlin";
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
  it("updates timezone once on foreground without recreating the session or asking permission", async () => {
    const { result } = renderSession();
    const session = result.current.session;
    await waitFor(() => expect(session.isRegistered()).toBe(true));
    mock.timezone = "Asia/Tokyo";
    await act(async () => mock.appState?.("active"));
    expect(mock.register).toHaveBeenCalledTimes(2);
    expect(mock.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: "en", timezone: "Asia/Tokyo" }),
    );
    await act(async () => {
      mock.appState?.("active");
      mock.appState?.("active");
    });
    expect(mock.token.mock.calls).toEqual([[false], [false]]);
    expect(mock.register).toHaveBeenCalledTimes(2);
    expect(result.current.session).toBe(session);
  });

  it("resyncs a timezone changed during persistence on the later foreground", async () => {
    let finish!: () => void;
    const writing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mock.register.mockReturnValueOnce(writing);
    const { result } = renderSession();
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
    expect(mock.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ timezone: "Europe/Berlin" }),
    );
    mock.timezone = "Asia/Tokyo";
    await act(async () => {
      finish();
      await writing;
    });
    expect(result.current.session.shouldRetryRegistration()).toBe(true);
    await act(async () => mock.appState?.("active"));
    expect(mock.register).toHaveBeenCalledTimes(2);
    expect(mock.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ timezone: "Asia/Tokyo" }),
    );
  });

  it("retries a failed timezone update then deduplicates successful foregrounds", async () => {
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    mock.timezone = "Asia/Tokyo";
    mock.register.mockRejectedValueOnce(new Error("offline"));
    await act(async () => mock.appState?.("active"));
    expect(result.current.session.shouldRetryRegistration()).toBe(true);
    await act(async () => mock.appState?.("active"));
    expect(mock.register).toHaveBeenCalledTimes(3);
    await act(async () => mock.appState?.("active"));
    expect(mock.register).toHaveBeenCalledTimes(3);
  });
  it("does not acknowledge a pending timezone write after sign-out", async () => {
    let finish!: () => void;
    const writing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mock.register.mockReturnValueOnce(writing);
    const { result, rerender } = renderSession();
    await waitFor(() => expect(mock.register).toHaveBeenCalledTimes(1));
    mock.authenticated = false;
    rerender();
    await act(async () => {
      finish();
      await writing;
    });
    expect(result.current.session.isRegistered()).toBe(false);
    mock.authenticated = true;
    mock.timezone = "Asia/Tokyo";
    rerender();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    expect(mock.register).toHaveBeenCalledTimes(2);
    expect(mock.register).toHaveBeenLastCalledWith(
      expect.objectContaining({ timezone: "Asia/Tokyo" }),
    );
  });

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
  it("revokes the Siri capture token before signing out", async () => {
    const order: string[] = [];
    mock.revokeSiri.mockImplementationOnce(async () => {
      order.push("revoke");
    });
    mock.signOut.mockImplementationOnce(async () => {
      order.push("signOut");
    });
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    await act(async () => {
      await result.current.session.signOut();
    });
    expect(order).toEqual(["revoke", "signOut"]);
  });
  it.each(["signOut", "deleteAccount"] as const)(
    "%s clears the trial reminders",
    async (action) => {
      mock.clearTrial.mockClear();
      const { result } = renderSession();
      await waitFor(() =>
        expect(result.current.session.isRegistered()).toBe(true),
      );
      await act(async () => {
        await result.current.session[action]();
      });
      // Deleting also signs out, so the clear can run twice; it is idempotent.
      expect(mock.clearTrial).toHaveBeenCalled();
    },
  );
  it.each(["signOut", "deleteAccount"] as const)(
    "%s clears the reminder that names the first save",
    async (action) => {
      const { result } = renderSession();
      await waitFor(() =>
        expect(result.current.session.isRegistered()).toBe(true),
      );
      await act(async () => {
        await result.current.session[action]();
      });
      expect(mock.clearFirstSave).toHaveBeenCalled();
    },
  );
  it("turning save reminders off also clears the first-save reminder", async () => {
    const { result } = renderSession();
    await waitFor(() =>
      expect(result.current.session.isRegistered()).toBe(true),
    );
    await act(async () => {
      await result.current.session.setSaveReminders(true);
    });
    expect(mock.clearFirstSave).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.session.setSaveReminders(false);
    });
    expect(mock.clearFirstSave).toHaveBeenCalledOnce();
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
    mock.timezone = "Asia/Tokyo";
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

const opened = (data: Record<string, unknown>, identifier = "n1") => ({
  notification: { request: { identifier, content: { data } } },
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

  it("opens a second, distinct notification to the same screen", () => {
    // Two trial nudges both point at /add; the second tap is its own open.
    renderHook(() => useNotificationObserver());
    act(() => mock.tapped?.(opened({ url: "/add", kind: "trial_nudge" }, "a")));
    act(() => mock.tapped?.(opened({ url: "/add", kind: "trial_nudge" }, "b")));
    expect(mock.capture).toHaveBeenCalledTimes(2);
    expect(mock.push).toHaveBeenCalledTimes(2);
  });

  it("does not reopen a handled tap after another one arrives", () => {
    const a = opened({ url: "/item/a", kind: "read_reminder" }, "a");
    renderHook(() => useNotificationObserver());
    act(() => mock.tapped?.(a));
    act(() => mock.tapped?.(opened({ url: "/add" }, "b")));
    act(() => mock.tapped?.(a));
    expect(mock.push).toHaveBeenCalledTimes(2);
  });

  it("handles a launch tap once when the listener delivers it too", () => {
    const tap = opened({ url: "/item/abc", kind: "read_reminder" }, "r1");
    mock.lastResponse = tap;
    renderHook(() => useNotificationObserver());
    act(() => mock.tapped?.(tap));
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.push).toHaveBeenCalledTimes(1);
  });

  it("records nothing when a notification carries no destination", () => {
    mock.lastResponse = opened({ kind: "weekly_shelf" });
    renderHook(() => useNotificationObserver());
    expect(mock.capture).not.toHaveBeenCalled();
    expect(mock.push).not.toHaveBeenCalled();
  });
});
