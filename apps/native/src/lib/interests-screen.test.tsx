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
  button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
  sharePractice: vi.fn((_props: { sample?: { domain: string } }) => null),
  payloads: [] as { value: string; shareType: string }[],
  clearSharedPayloads: vi.fn(),
  paywall: { onDecline: () => {} },
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
  useOnboardingPaywall: (options: { onDecline: () => void }) => {
    mocks.paywall = options;
    return { asked: false, ask: vi.fn() };
  },
}));
vi.mock("@/lib/use-incoming-share-url", () => ({
  holdsOnlyLink: (payloads: { value: string }[], url: string) =>
    payloads.length === 1 && payloads[0].value === url,
}));
vi.mock("@/lib/share/process-share", () => ({
  firstSharedUrl: (payloads: { value: string }[]) => payloads[0]?.value ?? null,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: vi.fn(),
  getOnboardingProgress: () => ({
    spaces: [],
    step: ONBOARDING_STEPS.indexOf("interests"),
    travelCity: null,
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
vi.mock("@/components/onboarding/opener", () => ({
  OpenerStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/promise", () => ({
  PromiseStep: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/share-practice", () => ({
  SharePracticeStep: mocks.sharePractice,
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
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(
    ({
      children,
      actions,
    }: Children & { actions: { label: string; onPress: () => void }[] }) => (
      <div>
        {children}
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onPress}>
            {action.label}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-sharing", () => ({
  clearSharedPayloads: mocks.clearSharedPayloads,
  getSharedPayloads: () => mocks.payloads,
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
  mocks.sharePractice.mockClear();
  mocks.clearSharedPayloads.mockClear();
  mocks.payloads = [];
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

it("keeps the picked city with the progress until Travel is unpicked", () => {
  render(<OnboardingScreen />);
  const city = () => mocks.setOnboardingProgress.mock.lastCall?.[0].travelCity;
  fireEvent.click(chip("Travel"));
  expect(city()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "tripTeaser.cityTokyo" }));
  expect(city()).toBe("tokyo");
  fireEvent.click(chip("Travel"));
  expect(city()).toBeNull();
});

it("moves on to share practice only once a topic is picked, with that topic's post", () => {
  render(<OnboardingScreen />);
  const next = screen.getByRole("button", { name: "common.continue" });
  expect(next.hasAttribute("disabled")).toBe(true);

  fireEvent.click(chip("AI & tech"));
  fireEvent.click(next);
  expect(mocks.sharePractice.mock.lastCall?.[0].sample?.domain).toBe(
    "anthropic.com",
  );
});

it("drops a declined practice share even after the topics changed", () => {
  render(<OnboardingScreen />);
  fireEvent.click(chip("Food & recipes"));
  mocks.payloads = [
    {
      value: "https://www.anthropic.com/research/building-effective-agents",
      shareType: "url",
    },
  ];
  mocks.paywall.onDecline();
  expect(mocks.clearSharedPayloads).toHaveBeenCalledTimes(1);
});

it("keeps a link the person shared on their own when the paywall is declined", () => {
  render(<OnboardingScreen />);
  mocks.payloads = [{ value: "https://example.com/my-own", shareType: "url" }];
  mocks.paywall.onDecline();
  expect(mocks.clearSharedPayloads).not.toHaveBeenCalled();
});
