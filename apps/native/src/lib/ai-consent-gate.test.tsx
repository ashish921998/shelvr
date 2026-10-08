// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/_layout";

// The layout is the gate: the stack holds every save screen and every hook
// that saves on its own, so these check when it is, and is not, mounted.
const mocks = vi.hoisted(() => ({
  onboarded: true,
  status: "unset",
  replay: vi.fn(),
  resumeShare: vi.fn(),
}));
const nothing = vi.hoisted(() => () => null);

vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({
    status: mocks.status,
    savesBlocked: mocks.status === "loading" || mocks.status === "unset",
  }),
}));
vi.mock("@/components/ai-consent", () => ({
  AiConsentCard: vi.fn(() => <div>consent-card</div>),
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mocks.onboarded }),
}));
vi.mock("@/lib/replay-onboarding", () => ({
  useReplayOnboarding: mocks.replay,
}));
vi.mock("@/lib/share/use-resume-pending-share", () => ({
  useResumePendingShare: mocks.resumeShare,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: mocks.status !== "signed-out",
  }),
}));
vi.mock("expo-router", () => {
  const Stack = Object.assign(() => <div>app-stack</div>, {
    Screen: nothing,
    Protected: nothing,
  });
  return { Stack, Redirect: nothing, useRouter: () => ({}) };
});
vi.mock("@/lib/app-intents", () => ({ AppIntentsBridge: nothing }));
vi.mock("@/lib/exit-offer-reminder", () => ({ useExitOfferReminder: vi.fn() }));
vi.mock("@/lib/exit-offer-sheet", () => ({ ExitOfferSheetHost: nothing }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/home-feed", () => ({
  HomeFeedProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>loader</div>),
}));
vi.mock("@/components/trial-reminder-sheet", () => ({
  TrialReminderPrimerSheet: nothing,
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: nothing,
}));
vi.mock("@/lib/trial-reminder", () => ({ useTrialReminder: vi.fn() }));
vi.mock("@/lib/welcome-save", () => ({ useWelcomeSaveTracker: vi.fn() }));
vi.mock("@/lib/widget-sync", () => ({ RecentSavesWidgetSync: nothing }));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
}));

const shows = (text: string) => screen.queryByText(text) !== null;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onboarded = true;
  mocks.status = "unset";
});

it.each(["unset", "loading"] as const)(
  "mounts no save screen or self-saving hook for an existing user whose answer is %s",
  (status) => {
    mocks.status = status;
    render(<AppLayout />);
    expect(shows("app-stack")).toBe(false);
    expect(mocks.replay).not.toHaveBeenCalled();
    expect(mocks.resumeShare).not.toHaveBeenCalled();
    expect(shows("consent-card")).toBe(status === "unset");
    expect(shows("loader")).toBe(status === "loading");
  },
);

it("opens the app once the answer lands, whichever it was", () => {
  const { rerender } = render(<AppLayout />);
  for (const status of ["granted", "declined"]) {
    mocks.status = status;
    rerender(<AppLayout />);
    expect(shows("app-stack")).toBe(true);
    expect(shows("consent-card")).toBe(false);
  }
});

it("keeps onboarding mounted under the card, so the flow keeps its place", () => {
  mocks.onboarded = false;
  render(<AppLayout />);
  expect(shows("app-stack")).toBe(true);
  expect(shows("consent-card")).toBe(true);
});

it("shows a signed-out user no card", () => {
  mocks.status = "signed-out";
  mocks.onboarded = false;
  render(<AppLayout />);
  expect(shows("app-stack")).toBe(true);
  expect(shows("consent-card")).toBe(false);
});
