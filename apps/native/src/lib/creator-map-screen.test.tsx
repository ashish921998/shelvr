// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreatorMapScreen from "@/app/creator-map/[token]";

type PressableProps = {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  testID?: string;
};

const mocks = vi.hoisted(() => ({
  params: {} as { token?: string; city?: string },
  preview: { data: undefined, isError: false } as {
    data?: unknown;
    isError: boolean;
  },
  previewArgs: undefined as unknown,
  auth: { isLoading: false, isAuthenticated: true },
  raw: null as string | null,
  setPending: vi.fn(),
  clearPending: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  alert: vi.fn(),
  router: { back: vi.fn(), replace: vi.fn(), canGoBack: vi.fn(() => true) },
}));

vi.mock("@/lib/i18n", async () => {
  const en = (await import("@/locales/en.json")).default as Record<
    string,
    string | Record<string, string>
  >;
  return {
    useAppLocale: () => {},
    t: (key: string, params: Record<string, string | number> = {}) => {
      const entry = en[key];
      const text =
        typeof entry === "string"
          ? entry
          : params.count === 1
            ? entry.one
            : entry.other;
      return text.replace(/%\{(\w+)\}/g, (_, name: string) =>
        String(name === "formattedCount" ? params.count : params[name]),
      );
    },
  };
});
vi.mock("expo-secure-store", () => ({
  getItem: () => null,
  setItem: () => {},
}));
vi.mock("@/lib/pending-creator-map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pending-creator-map")>()),
  getPendingCreatorMap: () => mocks.raw,
  subscribePendingCreatorMap: () => () => {},
  setPendingCreatorMap: mocks.setPending,
  clearPendingCreatorMap: mocks.clearPending,
}));
vi.mock("@/lib/entitlement", () => ({ usePaywallGuard: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/public-map", () => ({
  publicMapUrl: (token: string) => `https://shelvr.app/m/${token}`,
}));
vi.mock("@/lib/share-link", () => ({
  shareRefOf: async () => "0123456789abcdef",
}));
vi.mock("@convex/_generated/api", () => ({
  api: { creatorMaps: { creatorMapPreview: "creatorMapPreview" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_ref: string, args: unknown) => {
    mocks.previewArgs = args;
    return { args };
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.preview }));
vi.mock("convex/react", () => ({ useConvexAuth: () => mocks.auth }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => mocks.params,
  useRouter: () => mocks.router,
}));
vi.mock("@/components/sign-in-view", () => ({
  SignInView: vi.fn(({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      sign-in-back
    </button>
  )),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(({ label }: { label: string }) => (
    <div>{`loader:${label}`}</div>
  )),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => <i>{name}</i>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      loading,
      onPress,
      testID,
    }: {
      title: string;
      loading?: boolean;
      onPress: () => void;
      testID?: string;
    }) => (
      <button
        type="button"
        data-testid={testID}
        data-loading={loading ? "true" : "false"}
        onClick={onPress}
      >
        {title}
      </button>
    ),
  ),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: vi.fn(({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      colors: { surface: "surface" },
      control: { minHeight: 48, pressRetentionOffset: 12 },
    },
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Pressable: vi.fn(({ children, onPress, testID }: PressableProps) => (
    <button type="button" data-testid={testID} onClick={onPress}>
      {typeof children === "function" ? children({ pressed: false }) : children}
    </button>
  )),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const MAYA = {
  ownerName: "Maya",
  city: "Mexico City",
  placeCount: 4,
  placeNames: ["Contramar", "Café Avellaneda", "Panadería Rosetta"],
};

function slot(token = TOKEN) {
  return JSON.stringify({
    token,
    city: "Mexico City",
    name: "Maya’s Mexico City",
    at: Date.now(),
  });
}

async function show(data: unknown, isError = false) {
  mocks.preview = { data, isError };
  const view = render(<CreatorMapScreen />);
  await act(async () => {});
  return view;
}

function openedEvents() {
  return mocks.capture.mock.calls.filter(
    ([event]) => event === "creator_map_opened",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { token: TOKEN, city: "Mexico City" };
  mocks.auth = { isLoading: false, isAuthenticated: true };
  mocks.raw = null;
  mocks.router.canGoBack.mockReturnValue(true);
});
afterEach(() => cleanup());

describe("creator map screen states", () => {
  it("asks for the preview with the link's token and city", async () => {
    await show(undefined);
    expect(mocks.previewArgs).toEqual({ token: TOKEN, city: "Mexico City" });
    cleanup();
    mocks.params = { token: TOKEN };
    await show(undefined);
    expect(mocks.previewArgs).toEqual({ token: TOKEN, city: "" });
  });

  it("shows a loader while the preview or sign-in loads", async () => {
    await show(undefined);
    expect(screen.getByText("loader:Loading")).toBeTruthy();
    cleanup();
    mocks.auth = { isLoading: true, isAuthenticated: false };
    await show(MAYA);
    expect(screen.getByText("loader:Loading")).toBeTruthy();
    expect(openedEvents()).toHaveLength(0);
  });

  it("shows the generic error when the preview fails", async () => {
    await show(undefined, true);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Please try again in a moment.")).toBeTruthy();
    expect(screen.getByTestId("creator-map-back-home").textContent).toBe(
      "Back to Home",
    );
  });

  it("says the map is no longer shared when the preview is empty-handed", async () => {
    await show(null);
    expect(screen.getByText("This map isn’t shared anymore")).toBeTruthy();
    expect(screen.getByText("Ask for a new link.")).toBeTruthy();
    expect(screen.getByTestId("creator-map-back-home")).toBeTruthy();
    expect(screen.queryByTestId("creator-map-save")).toBeNull();
  });

  it("says there are no places yet", async () => {
    await show({ ...MAYA, placeCount: 0, placeNames: [] });
    expect(screen.getByText("No places on this map yet")).toBeTruthy();
    expect(screen.getByTestId("creator-map-back-home")).toBeTruthy();
    expect(screen.queryByTestId("creator-map-save")).toBeNull();
  });

  it("shows the creator's city with up to three places and how many more", async () => {
    await show(MAYA);
    expect(screen.getByText("M")).toBeTruthy();
    expect(screen.getByText("Save Maya’s Mexico City")).toBeTruthy();
    expect(
      screen.getByText(
        "Maya’s places in Mexico City go into a list in your Shelvr, with links to the posts they came from.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Mexico City")).toBeTruthy();
    expect(screen.getByText("4 places")).toBeTruthy();
    for (const place of MAYA.placeNames) {
      expect(screen.getByText(place)).toBeTruthy();
    }
    expect(screen.getByText("and 1 more")).toBeTruthy();
    expect(screen.getByText("Free to save. You don’t need Pro.")).toBeTruthy();
    expect(screen.getByTestId("creator-map-save").textContent).toBe("Save all");
    expect(screen.getByTestId("creator-map-not-now").textContent).toBe(
      "Not now",
    );
  });

  it("names the map after its city when the creator has no first name", async () => {
    await show({
      city: "Mexico City",
      placeCount: 2,
      placeNames: ["Contramar", "Café Avellaneda"],
    });
    expect(screen.getByText("person.fill")).toBeTruthy();
    expect(screen.getByText("Save this Mexico City map")).toBeTruthy();
    expect(
      screen.getByText(
        "The places on this Mexico City map go into a list in your Shelvr, with links to the posts they came from.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/more$/)).toBeNull();
  });
});

describe("creator map screen actions", () => {
  it("writes the slot with the list's name when a signed-in person saves", async () => {
    await show(MAYA);
    fireEvent.click(screen.getByTestId("creator-map-save"));
    expect(mocks.capture).toHaveBeenCalledWith("creator_map_save_tapped", {
      signed_in: true,
      places: 4,
    });
    expect(mocks.setPending).toHaveBeenCalledWith({
      token: TOKEN,
      city: "Mexico City",
      name: "Maya’s Mexico City",
    });
    expect(screen.queryByText("sign-in-back")).toBeNull();
  });

  it("asks a signed-out person to sign in, and its back clears the slot", async () => {
    mocks.auth = { isLoading: false, isAuthenticated: false };
    await show(MAYA);
    fireEvent.click(screen.getByTestId("creator-map-save"));
    expect(mocks.capture).toHaveBeenCalledWith("creator_map_save_tapped", {
      signed_in: false,
      places: 4,
    });
    expect(mocks.setPending).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("sign-in-back"));
    expect(mocks.clearPending).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("creator-map-save")).toBeTruthy();
  });

  it("alerts when the slot cannot be written", async () => {
    const error = new Error("keychain unavailable");
    mocks.setPending.mockImplementationOnce(() => {
      throw error;
    });
    mocks.auth = { isLoading: false, isAuthenticated: false };
    await show(MAYA);
    fireEvent.click(screen.getByTestId("creator-map-save"));
    expect(mocks.captureError).toHaveBeenCalledWith(
      "creator_map_save_failed",
      error,
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "Couldn’t save these places. Try again.",
    );
    expect(screen.queryByText("sign-in-back")).toBeNull();
  });

  it("clears the slot and goes back on Not now", async () => {
    await show(MAYA);
    fireEvent.click(screen.getByTestId("creator-map-not-now"));
    expect(mocks.clearPending).toHaveBeenCalledTimes(1);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("opens Home when there is nothing to go back to", async () => {
    mocks.router.canGoBack.mockReturnValue(false);
    await show(null);
    fireEvent.click(screen.getByTestId("creator-map-back-home"));
    expect(mocks.clearPending).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
  });

  it("dims Save all while the slot holds this map", async () => {
    mocks.raw = slot();
    await show(MAYA);
    expect(screen.getByTestId("creator-map-save").dataset.loading).toBe("true");
    cleanup();
    mocks.raw = slot("fedcba9876543210fedcba9876543210");
    await show(MAYA);
    expect(screen.getByTestId("creator-map-save").dataset.loading).toBe(
      "false",
    );
  });
});

describe("creator_map_opened", () => {
  it.each([
    ["found", MAYA, false, 4],
    ["empty", { ...MAYA, placeCount: 0, placeNames: [] }, false, 0],
    ["gone", null, false, 0],
    ["error", undefined, true, 0],
  ] as const)("fires once for %s", async (outcome, data, isError, places) => {
    const view = await show(data, isError);
    view.rerender(<CreatorMapScreen />);
    await act(async () => {});
    expect(openedEvents()).toEqual([
      [
        "creator_map_opened",
        {
          signed_in: true,
          outcome,
          places,
          share_ref: "0123456789abcdef",
        },
      ],
    ]);
  });

  it("says whether the person was signed in", async () => {
    mocks.auth = { isLoading: false, isAuthenticated: false };
    await show(MAYA);
    expect(openedEvents()[0]?.[1]).toMatchObject({ signed_in: false });
  });
});
