// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationSessionProvider,
  useNotificationSession,
} from "./notifications";

const mock = vi.hoisted(() => ({
  authenticated: true,
  locale: "en",
  token: vi.fn(),
  register: vi.fn(),
  otherMutation: vi.fn(),
  signOut: vi.fn(),
  captureError: vi.fn(),
  appState: null as null | ((state: string) => void),
  rotated: null as null | ((token: { type: string; data: string }) => void),
}));
vi.mock("@/lib/i18n", () => ({
  currentLocale: () => mock.locale,
  useAppLocale: () => mock.locale,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError, reset: vi.fn() },
}));
vi.mock("./notification-token", () => ({ getExpoPushToken: mock.token }));
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
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
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
  mock.token.mockReset().mockResolvedValue("expo-token");
});

function renderSession() {
  return renderHook(() => useNotificationSession(), {
    wrapper: NotificationSessionProvider,
  });
}

describe("notification session lifecycle", () => {
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
