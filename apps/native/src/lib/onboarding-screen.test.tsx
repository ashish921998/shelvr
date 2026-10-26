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
import OnboardingScreen from "@/app/(app)/onboarding";
import { ahaReel, ahaReelUrl } from "@/lib/aha-reels";
import { ONBOARDING_STEPS } from "@/lib/onboarding-steps";

type Children = { children?: ReactNode };
type Sample = { kind: string; city: string };

const mocks = vi.hoisted(() => ({
  setOnboardingProgress: vi.fn(),
  setPendingSpaces: vi.fn(),
  queueDemoUrl: vi.fn(),
  completeOnboarding: vi.fn(),
  capture: vi.fn(),
  ask: vi.fn(),
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: Children & { onPress: () => void; accessibilityLabel?: string }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  share: vi.fn((_props: { sample: Sample }) => null),
  commitment: vi.fn(),
  progress: {
    spaces: [] as string[],
    step: 0,
    travelCity: null as string | null,
    goals: [] as string[],
    savedCount: null as string | null,
    planner: null as string | null,
  },
  paywall: {} as { onPro: () => void },
}));

const button = (label: string, onPress: () => void) => (
  <button type="button" onClick={onPress}>
    {label}
  </button>
);

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: vi.fn() },
}));
vi.mock("@/lib/motion", () => ({ stepTransition: () => ({}) }));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ completeOnboarding: mocks.completeOnboarding }),
}));
vi.mock("@/lib/welcome-save", () => ({ noteOnboardingFinished: vi.fn() }));
vi.mock("@/lib/onboarding-paywall", () => ({
  useOnboardingPaywall: (options: { onPro: () => void }) => {
    mocks.paywall = options;
    return { asked: false, ask: mocks.ask };
  },
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: vi.fn(),
  getOnboardingProgress: () => mocks.progress,
  queueDemoUrl: mocks.queueDemoUrl,
  resolveOnboardingSpaceName: (name: string) => name,
  setOnboardingProgress: mocks.setOnboardingProgress,
  setPendingSpaces: mocks.setPendingSpaces,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  markPendingShareOnDevice: vi.fn(),
}));
vi.mock("@/components/sign-in-view", () => ({ SignInView: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/onboarding/parts", () => ({
  ScalePressable: mocks.pressable,
}));
vi.mock("@/components/onboarding/opener", () => ({
  OpenerStep: vi.fn(({ onStart }: { onStart: () => void }) =>
    button("opener:start", onStart),
  ),
}));
vi.mock("@/components/onboarding/questions", () => ({
  SavedCountStep: vi.fn(
    ({
      onPick,
      onContinue,
    }: {
      onPick: (count: string) => void;
      onContinue: () => void;
    }) => (
      <div>
        {button("count:hundreds", () => onPick("hundreds"))}
        {button("count:continue", onContinue)}
      </div>
    ),
  ),
  GoalStep: vi.fn(
    ({
      picked,
      onChange,
      onContinue,
    }: {
      picked: string[];
      onChange: (goals: string[]) => void;
      onContinue: () => void;
    }) => (
      <div>
        {button("goal:food", () => onChange([...picked, "food"]))}
        {button("goal:travel", () => onChange([...picked, "travel"]))}
        {button("goal:continue", onContinue)}
      </div>
    ),
  ),
  PlannerStep: vi.fn(
    ({
      onPick,
      onContinue,
    }: {
      onPick: (planner: string) => void;
      onContinue: () => void;
    }) => (
      <div>
        {button("planner:explorer", () => onPick("explorer"))}
        {button("planner:continue", onContinue)}
      </div>
    ),
  ),
}));
vi.mock("@/components/onboarding/progress-chart", () => ({
  ProgressChartStep: vi.fn(
    ({ kind, onContinue }: { kind: string; onContinue: () => void }) =>
      button(`chart:${kind}`, onContinue),
  ),
}));
vi.mock("@/components/onboarding/city-step", () => ({
  CityStep: vi.fn(
    ({
      kind,
      onPick,
    }: {
      kind: string;
      onPick: (city: string | null) => void;
    }) => (
      <div>
        {button(`city:${kind}:lisbon`, () => onPick("lisbon"))}
        {button("city:none", () => onPick(null))}
      </div>
    ),
  ),
}));
vi.mock("@/components/onboarding/aha-share", () => ({
  AhaShareStep: vi.fn((props: { sample: Sample; onShared: () => void }) => {
    mocks.share(props);
    return button("aha:share", props.onShared);
  }),
}));
vi.mock("@/components/onboarding/aha-spots", () => ({
  AhaSpotsStep: vi.fn(({ onContinue }: { onContinue: () => void }) =>
    button("aha:spots", onContinue),
  ),
}));
vi.mock("@/components/onboarding/commitment", () => ({
  CommitmentStep: vi.fn((props: { sample: Sample; onContinue: () => void }) => {
    mocks.commitment(props);
    return button("commitment:continue", props.onContinue);
  }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-sharing", () => ({ getSharedPayloads: () => [] }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: mocks.view },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { colors: { foreground: "#000" }, gap: (n: number) => n * 8 },
  }),
}));
vi.mock("react-native", () => ({
  View: mocks.view,
  Text: mocks.text,
}));

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const saved = () => mocks.setOnboardingProgress.mock.lastCall?.[0];
const startAt = (step: (typeof ONBOARDING_STEPS)[number]) => {
  mocks.progress = { ...mocks.progress, step: ONBOARDING_STEPS.indexOf(step) };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.progress = {
    spaces: [],
    step: 0,
    travelCity: null,
    goals: [],
    savedCount: null,
    planner: null,
  };
});
afterEach(cleanup);

it("walks the questions into a sample for the goal that leads, and keeps every answer", () => {
  render(<OnboardingScreen />);
  tap("opener:start");
  tap("count:hundreds");
  tap("count:continue");
  tap("goal:food");
  tap("goal:travel");
  tap("goal:continue");
  tap("planner:explorer");
  tap("planner:continue");
  tap("chart:trip");
  tap("city:trip:lisbon");
  expect(saved()).toMatchObject({
    goals: ["food", "travel"],
    spaces: ["Travel", "Restaurants to try"],
    savedCount: "hundreds",
    planner: "explorer",
    travelCity: "lisbon",
    step: ONBOARDING_STEPS.indexOf("ahaShare"),
  });
  expect(mocks.share.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "austin",
  });
});

it("plans for every goal when the goal question is skipped", () => {
  startAt("goal");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(saved()?.goals).toEqual(["date", "travel", "food"]);
  expect(screen.getByRole("button", { name: "planner:continue" })).toBeTruthy();
});

it("goes back from a question and from the sample", () => {
  startAt("planner");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "goal:continue" })).toBeTruthy();
  cleanup();
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "aha:share" })).toBeTruthy();
});

it("moves one step on a double tap", () => {
  startAt("ahaShare");
  render(<OnboardingScreen />);
  const share = screen.getByRole("button", { name: "aha:share" });
  fireEvent.click(share);
  fireEvent.click(share);
  expect(screen.getByRole("button", { name: "aha:spots" })).toBeTruthy();
});

it("reuses the sample for the commitment after the spots, before opening the paywall", async () => {
  mocks.progress = {
    ...mocks.progress,
    goals: ["travel"],
    travelCity: "lisbon",
  };
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  await act(async () => tap("aha:spots"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.commitment.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "austin",
  });
  expect(saved()?.step).toBe(ONBOARDING_STEPS.indexOf("commitment"));
  await act(async () => tap("commitment:continue"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

it("returns from commitment to the same spots without opening the paywall", () => {
  startAt("commitment");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "aha:spots" })).toBeTruthy();
  expect(mocks.ask).not.toHaveBeenCalled();
});

it("hands the goals' spaces to the replay and reports the answers when onboarding ends", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("ahaSpots"),
    goals: ["date"],
    savedCount: "few",
    planner: "planner",
    travelCity: "paris",
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.setPendingSpaces).toHaveBeenCalledWith(["Date nights"]);
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(
    ahaReelUrl(ahaReel("date", "austin")!),
  );
  expect(mocks.completeOnboarding).toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_completed",
    expect.objectContaining({
      goal: "date",
      goals: ["date"],
      saved_count: "few",
      planner: "planner",
      sample_city: "paris",
    }),
  );
});

it("queues the real reel it played as the first save when onboarding ends", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("ahaSpots"),
    goals: ["date"],
    travelCity: "austin",
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(
    ahaReelUrl(ahaReel("date", "austin")!),
  );
});

it("queues the default reel before leaving onboarding when the city question was skipped", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("commitment"),
    goals: ["travel"],
    travelCity: null,
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(
    ahaReelUrl(ahaReel("trip", "austin")!),
  );
  expect(mocks.queueDemoUrl.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.completeOnboarding.mock.invocationCallOrder[0],
  );
});
