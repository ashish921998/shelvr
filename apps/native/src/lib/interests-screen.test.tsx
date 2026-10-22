// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OnboardingScreen from "@/app/(app)/onboarding";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { ONBOARDING_STEPS } from "@/lib/onboarding-steps";

type Children = { children?: ReactNode };

const mocks = vi.hoisted(() => ({
  setOnboardingProgress: vi.fn(),
  setPendingSpaces: vi.fn(),
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityState,
  }: Children & {
    onPress: () => void;
    accessibilityRole?: string;
    accessibilityState?: { checked?: boolean };
  }) => (
    <button
      type="button"
      role={accessibilityRole}
      aria-checked={accessibilityState?.checked}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ completeOnboarding: vi.fn() }),
}));
vi.mock("@/lib/onboarding-paywall", () => ({
  useOnboardingPaywall: () => ({ asked: false, ask: vi.fn() }),
}));
vi.mock("@/lib/use-incoming-share-url", () => ({ holdsOnlyLink: () => false }));
vi.mock("@/lib/queued-first-save", () => ({
  getQueuedFirstSaveUrl: () => null,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: vi.fn(),
  getOnboardingProgress: () => ({
    saveKinds: [],
    spaces: [],
    step: ONBOARDING_STEPS.indexOf("interests"),
    demo: null,
    saved: null,
  }),
  resolveOnboardingSpaceName: (name: string) => name,
  setOnboardingProgress: mocks.setOnboardingProgress,
  setPendingSpaces: mocks.setPendingSpaces,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  clearPendingShareOnDevice: vi.fn(),
  markPendingShareOnDevice: vi.fn(),
}));
vi.mock("@/components/sign-in-view", () => ({ SignInView: vi.fn(() => null) }));
vi.mock("@/components/onboarding/live-demo", () => ({
  LiveDemoStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/notifications", () => ({
  NotificationsStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/opener", () => ({
  OpenerStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/promise", () => ({
  PromiseStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/setup", () => ({
  SetupStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/share-practice", () => ({
  SharePracticeStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/trip-teaser", () => ({
  TripBuildStep: vi.fn(() => null),
  TripLockedStep: vi.fn(() => null),
  TripRevealStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mocks.button,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-sharing", () => ({
  clearSharedPayloads: vi.fn(),
  getSharedPayloads: () => [],
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: { primary: "#000", foreground: "#000" }, gap: () => 0 },
  }),
}));
vi.mock("react-native", () => ({
  View: mocks.view,
  ScrollView: mocks.view,
  Text: mocks.text,
  Pressable: mocks.pressable,
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
}));

const SPOTS_TITLE = "interests.vibesTitle";
const chip = (id: string) =>
  screen.getByRole("checkbox", { name: onboardingLabel(id) });
const savedSpaces = () =>
  mocks.setOnboardingProgress.mock.lastCall?.[0].spaces as string[];

beforeEach(() => {
  mocks.setOnboardingProgress.mockClear();
});
afterEach(cleanup);

it("keeps a spot as a space until Travel is unpicked, then forgets it", () => {
  render(<OnboardingScreen />);
  expect(screen.queryByText(SPOTS_TITLE)).toBeNull();

  fireEvent.click(chip("Travel"));
  expect(screen.getByText(SPOTS_TITLE)).toBeTruthy();
  fireEvent.click(chip("Good food"));
  fireEvent.click(chip("AI & tech"));
  expect(savedSpaces()).toEqual(["Travel", "Good food", "AI & tech"]);
  expect(chip("Good food").getAttribute("aria-checked")).toBe("true");

  fireEvent.click(chip("Good food"));
  expect(savedSpaces()).toEqual(["Travel", "AI & tech"]);
  fireEvent.click(chip("Hidden gems"));

  fireEvent.click(chip("Travel"));
  expect(screen.queryByText(SPOTS_TITLE)).toBeNull();
  expect(savedSpaces()).toEqual(["AI & tech"]);

  fireEvent.click(chip("Travel"));
  expect(chip("Hidden gems").getAttribute("aria-checked")).toBe("false");
  expect(savedSpaces()).toEqual(["AI & tech", "Travel"]);
});
