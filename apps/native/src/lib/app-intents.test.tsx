// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAppIntentsSignOutReset } from "./app-intents";

const mocks = vi.hoisted(() => ({
  setEntityCatalog: vi.fn(),
  clearSpotlight: vi.fn(),
  clearCaptureCredentials: vi.fn(),
  deleteThumbs: vi.fn(),
  captureError: vi.fn(),
  appState: [] as ((state: string) => void)[],
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
}));
vi.mock("expo-app-intents", () => ({
  isAvailable: () => true,
  setEntityCatalogAsync: mocks.setEntityCatalog,
  clearPendingInvocationsAsync: () => Promise.resolve(),
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    clearCaptureCredentials: mocks.clearCaptureCredentials,
    clearSpotlight: mocks.clearSpotlight,
  }),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file://docs" },
  File: class {},
  Directory: class {
    exists = true;
    delete = mocks.deleteThumbs;
  },
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({ remove: vi.fn(), getString: vi.fn(), set: vi.fn() }),
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      mocks.appState.push(listener);
      return {
        remove: () => {
          mocks.appState = mocks.appState.filter((l) => l !== listener);
        },
      };
    },
  },
}));
vi.mock("react-native-nitro-image", () => ({ Images: {} }));
vi.mock("expo-router", () => ({
  useRouter: () => ({}),
  useNavigationContainerRef: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError, capture: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: () => ({}) }));
vi.mock("@/lib/entitlement", () => ({ useEntitlement: () => ({}) }));
vi.mock("@/lib/access", () => ({ canSave: () => false }));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => ({}) }));
vi.mock("@/lib/home-feed", () => ({ useHomeFeed: () => ({}) }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/use-save-image", () => ({ useSaveImages: () => ({}) }));
vi.mock("@/lib/app-intent-invocations", () => ({
  drainInvocations: vi.fn(),
  isSaveInvocation: vi.fn(),
}));

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.setEntityCatalog.mockReset().mockResolvedValue(undefined);
  mocks.clearSpotlight.mockReset().mockResolvedValue(undefined);
  mocks.clearCaptureCredentials.mockReset().mockResolvedValue(undefined);
  mocks.deleteThumbs.mockReset();
  mocks.captureError.mockReset();
  mocks.appState = [];
});

it("finishes a sign-out clear that failed partway once the app is back in front", async () => {
  mocks.setEntityCatalog.mockRejectedValueOnce(new Error("busy"));
  renderHook(() => useAppIntentsSignOutReset());
  await flush();
  expect(mocks.clearSpotlight).toHaveBeenCalledOnce();
  expect(mocks.deleteThumbs).toHaveBeenCalledOnce();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "app_intents_publish_failed",
    expect.any(Error),
  );

  mocks.appState.forEach((listener) => listener("active"));
  await flush();
  expect(mocks.setEntityCatalog).toHaveBeenCalledTimes(4);
  expect(mocks.clearSpotlight).toHaveBeenCalledTimes(2);

  mocks.appState.forEach((listener) => listener("active"));
  await flush();
  expect(mocks.clearSpotlight).toHaveBeenCalledTimes(2);
});
