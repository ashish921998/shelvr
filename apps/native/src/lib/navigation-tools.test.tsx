// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileScreen from "@/app/(app)/profile";

const mocks = vi.hoisted(() => ({
  located: undefined as boolean | undefined,
  entitled: true,
  canGoBack: true,
  order: [] as string[],
  capture: vi.fn(),
  query: vi.fn(),
  push: vi.fn(),
  wait: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: null }),
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({ getString: () => undefined }),
}));
vi.mock("@/lib/appearance-runtime", () => ({
  useAppearanceMode: () => ({ mode: "system", setMode: vi.fn() }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({
    status: mocks.entitled ? "pro" : "none",
    entitled: mocks.entitled,
    loading: false,
  }),
  waitForSheetTransition: mocks.wait,
  openPaywall: vi.fn(),
}));
vi.mock("@/lib/manage-subscription", () => ({ manageSubscription: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    operation: "idle",
    session: { signOut: vi.fn() },
  }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: { photoUsage: "photoUsage", hasLocatedItems: "hasLocatedItems" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (reference: string) => ({ reference }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { reference: string; enabled?: boolean }) => {
    mocks.query(options);
    return {
      data: options.reference === "hasLocatedItems" ? mocks.located : undefined,
    };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({
    canGoBack: () => mocks.canGoBack,
    back: () => mocks.order.push("back"),
    replace: (path: string) => mocks.order.push(`replace:${path}`),
    push: mocks.push,
  }),
}));
vi.mock("@/components/ui/settings-list", () => ({
  SettingsGroup: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  SettingsRow: vi.fn(
    ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  ),
}));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("@/components/feedback/feedback-modal", () => ({
  FeedbackModal: vi.fn(() => null),
}));
vi.mock("@/components/wordmark", () => ({ Wordmark: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.located = undefined;
  mocks.entitled = true;
  mocks.canGoBack = true;
  mocks.order = [];
  mocks.wait.mockImplementation(() => {
    mocks.order.push("wait");
    return Promise.resolve();
  });
  mocks.push.mockImplementation((path: string) =>
    mocks.order.push(`push:${path}`),
  );
});
afterEach(cleanup);

it.each([undefined, false, true])(
  "shows Map only for resolved true eligibility (%s)",
  (located) => {
    mocks.located = located;
    render(<ProfileScreen />);
    expect(screen.getByText("navigation.tidy")).toBeTruthy();
    expect(Boolean(screen.queryByText("navigation.map"))).toBe(
      located === true,
    );
  },
);

it.each([false, true])(
  "enables location eligibility only when entitled (%s)",
  (entitled) => {
    mocks.entitled = entitled;
    render(<ProfileScreen />);
    expect(screen.getByText("navigation.tidy")).toBeTruthy();
    expect(mocks.query).toHaveBeenCalledWith({
      reference: "hasLocatedItems",
      enabled: entitled,
    });
  },
);

it.each([
  ["tidy", true],
  ["tidy", false],
  ["map", true],
  ["map", false],
] as const)(
  "closes Profile before waiting and pushing %s (modal %s)",
  async (tool, modal) => {
    mocks.located = true;
    mocks.canGoBack = modal;
    let settle: () => void = () => {};
    mocks.wait.mockImplementation(() => {
      mocks.order.push("wait");
      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    });
    render(<ProfileScreen />);
    fireEvent.click(screen.getByText(`navigation.${tool}`));
    expect(mocks.order).toEqual([modal ? "back" : "replace:/", "wait"]);
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => {
      settle();
    });
    expect(mocks.order).toEqual([
      modal ? "back" : "replace:/",
      "wait",
      `push:/${tool}`,
    ]);
    expect(mocks.capture).toHaveBeenCalledWith(`${tool}_opened`, {
      source: "profile",
    });
  },
);
