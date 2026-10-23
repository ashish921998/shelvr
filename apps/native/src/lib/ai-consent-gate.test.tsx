// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/_layout";

const mocks = vi.hoisted(() => ({
  onboarded: true,
  status: "unset",
  grantOnItsWay: false,
  entitlement: { entitled: true, loading: false },
  replay: vi.fn(),
  resumeShare: vi.fn(),
  awaitingPurchase: false,
  push: vi.fn(),
}));
const nothing = vi.hoisted(() => () => null);

vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({
    status: mocks.status,
    savesBlocked: mocks.status === "loading" || mocks.status === "unset",
    asking: mocks.status === "unset" && !mocks.grantOnItsWay,
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
  useAwaitingOnboardingPurchase: () => mocks.awaitingPurchase,
}));
vi.mock("@/lib/queued-first-save", () => ({
  useQueuedFirstSave: vi.fn(),
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
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => mocks.entitlement,
}));
vi.mock("expo-router", () => {
  const screen = ({ name }: { name: string }) => (
    <span>{`screen:${name}`}</span>
  );
  const guarded = ({
    guard,
    children,
  }: {
    guard: boolean;
    children: ReactNode;
  }) => (guard ? children : null);
  const Stack = Object.assign(
    ({ children }: { children: ReactNode }) => (
      <div>
        <span>app-stack</span>
        {children}
      </div>
    ),
    {
      Screen: screen,
      Protected: guarded,
    },
  );
  return { Stack, Redirect: nothing, useRouter: () => ({ push: mocks.push }) };
});
vi.mock("@/lib/app-intents", () => ({ AppIntentsBridge: nothing }));
vi.mock("@/lib/forget-exit-offer", () => ({ useForgetExitOffer: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/home-feed", () => ({
  HomeFeedProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock("@/components/plan-loading-cover", () => ({
  PlanLoadingCover: vi.fn(() => <div>plan-loading-cover</div>),
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
vi.mock("@/lib/pending-weekly-shelf", () => ({
  usePendingWeeklyShelf: vi.fn(),
}));
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
  mocks.entitlement = { entitled: true, loading: false };
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

it("shows no card while the yes given at sign-in is being recorded", () => {
  mocks.status = "unset";
  mocks.grantOnItsWay = true;
  mocks.onboarded = true;
  try {
    render(<AppLayout />);
    expect(shows("consent-card")).toBe(false);
    expect(shows("app-stack")).toBe(false);
    expect(shows("loader")).toBe(true);
  } finally {
    mocks.grantOnItsWay = false;
  }
});

describe("plan gate", () => {
  beforeEach(() => {
    mocks.status = "granted";
  });

  it("shows only the plan gate, Profile, Settings and the paywall without a plan", () => {
    mocks.entitlement = { entitled: false, loading: false };
    render(<AppLayout />);
    expect(shows("screen:plan-gate")).toBe(true);
    expect(shows("screen:(tabs)")).toBe(false);
    expect(shows("screen:add")).toBe(false);
    expect(shows("screen:item/[id]")).toBe(false);
    expect(shows("screen:profile")).toBe(true);
    expect(shows("screen:settings")).toBe(true);
    expect(shows("screen:paywall")).toBe(true);
  });

  it("opens the app with a plan", () => {
    mocks.entitlement = { entitled: true, loading: false };
    render(<AppLayout />);
    expect(shows("screen:(tabs)")).toBe(true);
    expect(shows("screen:plan-gate")).toBe(false);
  });

  it("keeps a deep link's screen under a cover while the plan is still unknown", () => {
    mocks.entitlement = { entitled: false, loading: true };
    render(<AppLayout />);
    expect(shows("screen:item/[id]")).toBe(true);
    expect(shows("screen:digest/[id]")).toBe(true);
    expect(shows("screen:plan-gate")).toBe(false);
    expect(shows("plan-loading-cover")).toBe(true);
    expect(shows("screen:camera")).toBe(false);
    expect(shows("screen:add")).toBe(false);
  });

  it("lifts the cover once the plan is known", () => {
    mocks.entitlement = { entitled: true, loading: false };
    render(<AppLayout />);
    expect(shows("plan-loading-cover")).toBe(false);
  });

  it("keeps someone who just paid out of the gate while the purchase lands", () => {
    mocks.entitlement = { entitled: false, loading: false };
    mocks.awaitingPurchase = true;
    try {
      render(<AppLayout />);
      expect(shows("screen:(tabs)")).toBe(true);
      expect(shows("screen:plan-gate")).toBe(false);
    } finally {
      mocks.awaitingPurchase = false;
    }
  });

  it("never gates onboarding", () => {
    mocks.onboarded = false;
    mocks.entitlement = { entitled: false, loading: false };
    render(<AppLayout />);
    expect(shows("screen:onboarding")).toBe(true);
    expect(shows("screen:plan-gate")).toBe(false);
  });

  it("opens a sheet deep link once the plan is known and Pro", async () => {
    const { releaseSheetLink, rememberSheetLink } =
      await import("@/lib/deferred-sheet-link");
    releaseSheetLink(true);
    rememberSheetLink("shelvr://add?mode=note");
    mocks.entitlement = { entitled: false, loading: true };
    const { rerender } = render(<AppLayout />);
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.entitlement = { entitled: true, loading: false };
    rerender(<AppLayout />);
    expect(mocks.push).toHaveBeenCalledWith("/add?mode=note");
  });

  it("drops a sheet deep link when the plan is known and missing", async () => {
    const { releaseSheetLink, rememberSheetLink } =
      await import("@/lib/deferred-sheet-link");
    releaseSheetLink(true);
    rememberSheetLink("shelvr://camera");
    mocks.entitlement = { entitled: false, loading: true };
    const { rerender } = render(<AppLayout />);

    mocks.entitlement = { entitled: false, loading: false };
    rerender(<AppLayout />);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(shows("screen:plan-gate")).toBe(true);
    expect(releaseSheetLink(false)).toBeNull();
  });

  it("never covers onboarding while the plan loads", () => {
    mocks.onboarded = false;
    mocks.entitlement = { entitled: false, loading: true };
    render(<AppLayout />);
    expect(shows("screen:onboarding")).toBe(true);
    expect(shows("plan-loading-cover")).toBe(false);
  });
});
