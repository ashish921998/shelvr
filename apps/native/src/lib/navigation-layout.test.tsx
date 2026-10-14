// @vitest-environment jsdom
import type { ReactElement, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TabsLayout from "@/app/(app)/(tabs)/_layout";
import AppLayout from "@/app/(app)/_layout";

const mocks = vi.hoisted(() => ({
  os: "ios",
  onboarded: true,
  stackScreen: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(
    ({ children, testID }: { children: ReactNode; testID?: string }) => (
      <span data-testid={testID}>{children}</span>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("@/components/ui/app-tab-bar", () => ({
  AppTabs: vi.fn(() => <div data-testid="fallback-tabs" />),
}));
vi.mock("expo-router/unstable-native-tabs", () => {
  const Trigger = Object.assign(
    ({
      name,
      role,
      children,
    }: {
      name: string;
      role?: string;
      children: ReactNode;
    }) => (
      <div data-testid="tab-trigger" data-name={name} data-role={role}>
        {children}
      </div>
    ),
    {
      Icon: vi.fn(() => null),
      Label: vi.fn(({ children }: { children: ReactNode }) => (
        <span>{children}</span>
      )),
    },
  );
  return {
    NativeTabs: Object.assign(
      ({ children }: { children: ReactNode }) => (
        <div data-testid="native-tabs">{children}</div>
      ),
      { Trigger },
    ),
  };
});
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  Redirect: vi.fn(() => null),
  Stack: Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Protected: vi.fn(
        ({ guard, children }: { guard: boolean; children: ReactNode }) =>
          guard ? children : null,
      ),
      Screen: vi.fn(
        (props: {
          name: string;
          options?: Record<string, unknown>;
          children?: ReactNode;
        }) => {
          mocks.stackScreen(props);
          return (
            <div data-testid={`stack-${props.name}`}>{props.children}</div>
          );
        },
      ),
      Title: vi.fn(({ children }: { children: ReactNode }) => children),
    },
  ),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mocks.onboarded }),
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ asking: false, savesBlocked: false }),
}));
vi.mock("@/lib/home-feed", () => ({
  HomeFeedProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock("@/components/ai-consent", () => ({
  AiConsentCard: vi.fn(() => null),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/trial-reminder-sheet", () => ({
  TrialReminderPrimerSheet: vi.fn(() => null),
}));
vi.mock("@/lib/app-intents", () => ({ AppIntentsBridge: vi.fn(() => null) }));
vi.mock("@/lib/widget-sync", () => ({
  RecentSavesWidgetSync: vi.fn(() => null),
}));
vi.mock("@/lib/exit-offer-sheet", () => ({
  ExitOfferSheetHost: vi.fn(() => null),
}));
vi.mock("@/lib/exit-offer-reminder", () => ({
  useExitOfferReminder: () => {},
}));
vi.mock("@/lib/replay-onboarding", () => ({ useReplayOnboarding: () => {} }));
vi.mock("@/lib/share/use-resume-pending-share", () => ({
  useResumePendingShare: () => {},
}));
vi.mock("@/lib/trial-reminder", () => ({ useTrialReminder: () => {} }));
vi.mock("@/lib/welcome-save", () => ({ useWelcomeSaveTracker: () => {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.os = "ios";
  mocks.onboarded = true;
});
afterEach(cleanup);

describe("tab layout", () => {
  it("registers only Home, Spaces, and the native Search trigger on iOS", () => {
    render(<TabsLayout />);
    expect(screen.getByTestId("native-tabs")).toBeTruthy();
    expect(screen.queryByTestId("fallback-tabs")).toBeNull();
    const triggers = screen.getAllByTestId("tab-trigger");
    expect(
      triggers.map((trigger) => trigger.getAttribute("data-name")),
    ).toEqual(["(home)", "(spaces)", "(search)"]);
    expect(
      triggers.map((trigger) => trigger.getAttribute("data-role")),
    ).toEqual([null, null, "search"]);
  });

  it("selects AppTabs instead of NativeTabs on Android", () => {
    mocks.os = "android";
    render(<TabsLayout />);
    expect(screen.getByTestId("fallback-tabs")).toBeTruthy();
    expect(screen.queryByTestId("native-tabs")).toBeNull();
  });
});

describe("app stack layout", () => {
  it.each(["tidy", "map"])(
    "offers Home for a cold-linked %s root but preserves ordinary Back",
    (name) => {
      render(<AppLayout />);
      const props = mocks.stackScreen.mock.calls.find(
        ([props]) => props.name === name,
      )?.[0];
      const headerLeft = props.options.headerLeft as (options: {
        canGoBack: boolean;
      }) => ReactElement<{ onPress: () => void }> | null;
      expect(headerLeft({ canGoBack: true })).toBeNull();
      headerLeft({ canGoBack: false })!.props.onPress();
      expect(mocks.replace).toHaveBeenCalledWith("/");
    },
  );
  it("registers Tidy and Map after onboarding and disables Tidy's back gesture", () => {
    render(<AppLayout />);
    expect(screen.getByTestId("stack-tidy")).toBeTruthy();
    expect(screen.getByTestId("stack-map")).toBeTruthy();
    expect(mocks.stackScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "tidy",
        options: expect.objectContaining({ gestureEnabled: false }),
      }),
    );
    expect(screen.getByTestId("tidy-screen-title").textContent).toBe(
      "navigation.tidyHeader",
    );
    expect(screen.getByTestId("map-screen-title").textContent).toBe(
      "navigation.mapHeader",
    );
  });

  it("keeps both tool routes unavailable before onboarding", () => {
    mocks.onboarded = false;
    render(<AppLayout />);
    expect(screen.queryByTestId("stack-tidy")).toBeNull();
    expect(screen.queryByTestId("stack-map")).toBeNull();
    expect(screen.getByTestId("stack-onboarding")).toBeTruthy();
  });
});
