// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppIntentsBridge, revokeSiriCapture } from "./app-intents";
import { DeviceSession } from "./notification-device-session";

const mock = vi.hoisted(() => ({
  token: "old-test-token",
  store: new Map<string, string>(),
  issue: vi.fn(async () => "replacement-test-token"),
  revoke: vi.fn(async (_args: { token: string }) => {}),
  report: vi.fn(),
  setCredentials: vi.fn(async (_url: string, _token: string) => {}),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.report },
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: { _id: "test-user" } }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: false, loading: true }),
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({ items: undefined }),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/use-save-image", () => ({ useSaveImages: vi.fn() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("convex/react", () => ({
  useAction: () => mock.issue,
  useMutation: () => vi.fn(),
  useConvexAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("expo-app-intents", () => ({
  isAvailable: () => true,
  useAppIntents: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Directory: vi.fn(),
  File: vi.fn(),
  Paths: {},
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    captureToken: async () => mock.token,
    hasCaptureCredentials: async () => true,
    setCaptureCredentials: mock.setCredentials,
  }),
}));
vi.mock("expo-router", () => ({
  useNavigationContainerRef: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => mock.store.get(key),
    set: (key: string, value: string) => mock.store.set(key, value),
    remove: (key: string) => mock.store.delete(key),
  }),
}));
vi.mock("react-native-nitro-image", () => ({ Images: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mock.store.clear();
  mock.store.set("captureOwner", "test-user");
});

it("replaces revoked Siri credentials when failed deletion remounts the app", async () => {
  const deletionError = new Error("deletion unavailable");
  const signOut = vi.fn(async () => {});
  const session = new DeviceSession(
    { read: async () => [], write: async () => {} },
    {
      getToken: async () => null,
      saveToken: async () => {},
      revokeToken: async () => {},
      revokeCapture: () => revokeSiriCapture(mock.revoke),
      setWeeklyShelf: async () => {},
      setSaveReminders: async () => {},
      signOut,
      deleteAccount: async () => {
        throw deletionError;
      },
      clearWidget: async () => {},
      resetAnalytics: vi.fn(),
      reportError: mock.report,
    },
  );
  function App() {
    const operation = useSyncExternalStore(
      session.subscribe,
      session.getSnapshot,
    );
    return operation === "delete_account" ? null : <AppIntentsBridge />;
  }
  render(<App />);
  await act(async () => {});
  expect(mock.issue).not.toHaveBeenCalled();
  await act(async () => {
    await expect(session.deleteAccount()).rejects.toBe(deletionError);
  });
  await waitFor(() =>
    expect(mock.setCredentials).toHaveBeenCalledWith(
      expect.any(String),
      "replacement-test-token",
    ),
  );
  expect(mock.revoke).toHaveBeenCalledWith({ token: "old-test-token" });
  expect(mock.issue).toHaveBeenCalledOnce();
  expect(mock.store.get("captureOwner")).toBe("test-user");
  expect(signOut).not.toHaveBeenCalled();
});

it("keeps valid credentials when server revocation fails", async () => {
  mock.revoke.mockRejectedValueOnce(new Error("offline"));
  await revokeSiriCapture(mock.revoke);
  render(<AppIntentsBridge />);
  await act(async () => {});
  expect(mock.issue).not.toHaveBeenCalled();
  expect(mock.store.get("captureOwner")).toBe("test-user");
  expect(mock.report).toHaveBeenCalledWith(
    "app_intents_revoke_failed",
    expect.any(Error),
  );
});
