// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import RootLayout from "@/app/_layout";

const mock = vi.hoisted(() => ({ operation: "idle", signedIn: true }));
const passthrough = vi.hoisted(
  () =>
    ({ children }: { children: ReactNode }) =>
      children,
);
const nothing = vi.hoisted(() => () => null);
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/onboarding", () => ({ OnboardingProvider: passthrough }));
vi.mock("@/lib/entitlement", () => ({
  noteAppTouch: vi.fn(),
  useEntitlementSync: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { screen: vi.fn() } }));
vi.mock("@convex-dev/auth/react", () => ({ ConvexAuthProvider: passthrough }));
vi.mock("@/lib/auth-storage", () => ({ authStorage: {} }));
vi.mock("@/lib/query-client", () => ({
  convex: {},
  persister: {},
  queryClient: {},
}));
vi.mock("@tanstack/react-query-persist-client", () => ({
  PersistQueryClientProvider: passthrough,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSegments: () => [],
  // A remount loses the child navigator's state. The simulator fault-injection
  // run checks the actual Expo Router destination separately.
  Slot: vi.fn(function Slot() {
    const [route, setRoute] = useState("Home");
    if (!mock.signedIn) return <div>Sign in</div>;
    return (
      <>
        <div>{route}</div>
        <button onClick={() => setRoute("Settings")}>Open settings</button>
      </>
    );
  }),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: nothing }));
vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: passthrough,
}));
vi.mock("posthog-react-native", () => ({ PostHogProvider: passthrough }));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ rt: { themeName: "light" } }),
}));
vi.mock("@/components/ui/action-menu", () => ({
  dropMenuDismissTouch: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  NotificationSessionProvider: passthrough,
  useNotificationObserver: vi.fn(),
  useNotificationSession: () => ({ operation: mock.operation }),
}));
vi.mock("@/components/splash/splash-gate", () => ({
  SplashGate: passthrough,
  useSplashGate: () => ({ showSplash: false, finishSplash: vi.fn() }),
}));
vi.mock("@/lib/nav-theme", () => ({ NavThemeProvider: passthrough }));
vi.mock("@/lib/analytics-identity", () => ({ useAnalyticsIdentity: vi.fn() }));
vi.mock("@/lib/app-intents", () => ({ useAppIntentsSignOutReset: vi.fn() }));
vi.mock("@/lib/convex-query-healing", () => ({
  useConvexQueryHealing: vi.fn(),
}));
vi.mock("@/lib/account-gone", () => ({ useSignOutWhenAccountGone: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ posthog: null }));
vi.mock("@/components/root-error-boundary", () => ({
  RootErrorBoundary: nothing,
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>Deleting account</div>),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

beforeEach(() => {
  mock.operation = "idle";
  mock.signedIn = true;
});

it("remounts the app after failed deletion instead of claiming Settings survived", () => {
  const { rerender } = render(<RootLayout />);
  fireEvent.click(screen.getByText("Open settings"));
  expect(screen.getByText("Settings")).toBeTruthy();
  mock.operation = "delete_account";
  rerender(<RootLayout />);
  expect(screen.getByText("Deleting account")).toBeTruthy();
  expect(screen.queryByText("Settings")).toBeNull();
  mock.operation = "idle";
  rerender(<RootLayout />);
  expect(screen.getByText("Home")).toBeTruthy();
  expect(screen.queryByText("Settings")).toBeNull();
});

it("remounts signed out after successful deletion", () => {
  const { rerender } = render(<RootLayout />);
  mock.operation = "delete_account";
  rerender(<RootLayout />);
  mock.signedIn = false;
  mock.operation = "idle";
  rerender(<RootLayout />);
  expect(screen.getByText("Sign in")).toBeTruthy();
  expect(screen.queryByText("Home")).toBeNull();
});
