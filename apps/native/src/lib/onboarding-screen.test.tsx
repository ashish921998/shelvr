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
import {
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
} from "@/lib/onboarding-steps";

type Children = { children?: ReactNode };
type Sample = { kind: string; city: string };

const mocks = vi.hoisted(() => ({
  setOnboardingProgress: vi.fn(),
  setPendingSpaces: vi.fn(),
  queueDemoUrl: vi.fn(),
  queueCityStamps: vi.fn(),
  completeOnboarding: vi.fn(),
  authenticated: false,
  capture: vi.fn(),
  captureError: vi.fn(),
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
  carousel: vi.fn(),
  notifications: vi.fn(),
  permission: vi.fn<() => Promise<"granted" | "ask" | "blocked">>(),
  progress: {
    spaces: [] as string[],
    step: 0,
    travelCity: null as string | null,
    beenCities: [] as string[],
    goals: [] as string[],
    savedCount: null as string | null,
    skippedShare: false,
    viewed: [] as string[],
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
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/motion", () => ({ stepTransition: () => ({}) }));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ completeOnboarding: mocks.completeOnboarding }),
}));
vi.mock("@/lib/welcome-save", () => ({ noteOnboardingFinished: vi.fn() }));
vi.mock("@/lib/free-plan", () => ({ useFreePlanOpen: () => false }));
vi.mock("@/lib/onboarding-paywall", async () => {
  const { useState } = await import("react");
  return {
    useOnboardingPaywall: (options: { onPro: () => void }) => {
      mocks.paywall = options;
      const [asked, setAsked] = useState(false);
      return {
        asked,
        ask: () => {
          mocks.ask();
          setAsked(true);
        },
      };
    },
  };
});
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: vi.fn(),
  getOnboardingProgress: () => mocks.progress,
  queueDemoUrl: mocks.queueDemoUrl,
  resolveOnboardingSpaceName: (name: string) => name,
  setOnboardingProgress: mocks.setOnboardingProgress,
  setPendingSpaces: mocks.setPendingSpaces,
}));
vi.mock("@/lib/pending-city-stamps", () => ({
  queueCityStamps: mocks.queueCityStamps,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  markPendingShareOnDevice: vi.fn(),
}));
vi.mock("@/components/sign-in-view", () => ({
  SignInView: vi.fn(({ onCompleted }: { onCompleted: () => void }) =>
    button("signIn:done", onCompleted),
  ),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/onboarding/parts", () => ({
  ScalePressable: mocks.pressable,
}));
vi.mock("@/components/onboarding/opener", () => ({
  OpenerStep: vi.fn(
    ({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) => (
      <div>
        {button("opener:start", onStart)}
        {button("opener:signIn", onSignIn)}
      </div>
    ),
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
}));
vi.mock("@/components/onboarding/been-step", () => ({
  BeenStep: vi.fn(
    ({
      picked,
      onChange,
      onContinue,
    }: {
      picked: string[];
      onChange: (picked: string[]) => void;
      onContinue: () => void;
    }) => (
      <div>
        <p>{`been:picked:${picked.join(",")}`}</p>
        {button("been:lisbon", () => onChange([...picked, "lisbon"]))}
        {button("been:continue", onContinue)}
      </div>
    ),
  ),
}));
vi.mock("@/components/onboarding/statement", () => ({
  StatementStep: vi.fn(
    ({ text, onContinue }: { text: string; onContinue: () => void }) => (
      <div>
        <p>{text}</p>
        {button("statement", onContinue)}
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
vi.mock("@/components/onboarding/first-save", () => ({
  FirstSaveStep: vi.fn(({ onContinue }: { onContinue: () => void }) =>
    button("firstSave:continue", onContinue),
  ),
}));
vi.mock("@/components/onboarding/city-step", () => ({
  CityStep: vi.fn(
    ({
      kind,
      question,
      onPick,
    }: {
      kind: string;
      question: string;
      onPick: (city: string | null) => void;
    }) => (
      <div>
        {button(`city:${kind}:${question}:lisbon`, () => onPick("lisbon"))}
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
vi.mock("@/components/onboarding/carousel", () => ({
  CarouselStep: vi.fn(
    (props: { sample: Sample; leaving: boolean; onContinue: () => void }) => {
      mocks.carousel(props);
      return button("carousel:continue", props.onContinue);
    },
  ),
}));
vi.mock("@/components/onboarding/notifications", () => ({
  NotificationsStep: vi.fn(
    (props: {
      sample: Sample;
      onAsking: (asking: boolean) => void;
      onContinue: () => void;
    }) => {
      mocks.notifications(props);
      return (
        <div>
          {button("notifications:continue", props.onContinue)}
          {button("notifications:asking", () => props.onAsking(true))}
        </div>
      );
    },
  ),
}));
vi.mock("@/lib/notification-token", () => ({
  notificationPermissionState: mocks.permission,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
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
const relaunch = () => {
  cleanup();
  mocks.progress = saved();
  render(<OnboardingScreen />);
};
const viewsOf = (stepId: string) =>
  mocks.capture.mock.calls.filter(
    ([event, properties]) =>
      event === "onboarding_step_viewed" && properties.step_id === stepId,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockReset().mockResolvedValue("ask");
  mocks.authenticated = false;
  mocks.progress = {
    spaces: [],
    step: 0,
    travelCity: null,
    beenCities: [],
    goals: [],
    savedCount: null,
    skippedShare: false,
    viewed: [],
  };
});
afterEach(cleanup);

it("walks the questions, the chart and the city echo into a sample for the goal that leads, and keeps every answer", () => {
  render(<OnboardingScreen />);
  tap("opener:start");
  tap("count:hundreds");
  tap("count:continue");
  tap("goal:food");
  tap("goal:travel");
  tap("goal:continue");
  tap("been:lisbon");
  tap("been:continue");
  tap("chart:trip");
  tap("city:trip:trip:lisbon");
  expect(saved()).toMatchObject({
    goals: ["food", "travel"],
    spaces: ["Travel", "Restaurants to try"],
    savedCount: "hundreds",
    beenCities: ["lisbon"],
    travelCity: "lisbon",
    step: ONBOARDING_STEPS.indexOf("cityEcho"),
  });
  expect(screen.getByText("onboardingStatement.cityPicked")).toBeTruthy();
  tap("statement");
  expect(mocks.share.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "lisbon",
  });
});

it("praises the city the user picked", () => {
  mocks.progress = {
    ...mocks.progress,
    goals: ["travel"],
    travelCity: "austin",
  };
  startAt("cityEcho");
  render(<OnboardingScreen />);
  expect(screen.getByText("onboardingStatement.cityPicked")).toBeTruthy();
});

it("plays the first-save moment between sharing and the spots", () => {
  startAt("ahaShare");
  render(<OnboardingScreen />);
  tap("aha:share");
  tap("firstSave:continue");
  expect(screen.getByRole("button", { name: "aha:spots" })).toBeTruthy();
});

it("plans for every goal when the goal question is skipped", () => {
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:food");
  tap("onboardingQ.skip");
  expect(saved()?.goals).toEqual(["date", "travel", "food"]);
  tap("been:continue");
  expect(screen.getByRole("button", { name: "chart:date" })).toBeTruthy();
});

it("asks where a person goes out when a date leads the goals", () => {
  mocks.progress = { ...mocks.progress, goals: ["date", "travel", "food"] };
  startAt("chart");
  render(<OnboardingScreen />);
  tap("chart:date");
  expect(
    screen.getByRole("button", { name: "city:date:out:lisbon" }),
  ).toBeTruthy();
});

it("goes back from the been step to the goals, and from the sample", () => {
  startAt("been");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "goal:continue" })).toBeTruthy();
  cleanup();
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(
    screen.getByRole("button", { name: "firstSave:continue" }),
  ).toBeTruthy();
});

it("asks where they have been after the goals, and keeps the picks with the progress", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:continue");
  tap("been:lisbon");
  expect(saved()).toMatchObject({
    beenCities: ["lisbon"],
    step: ONBOARDING_STEPS.indexOf("been"),
    viewed: expect.arrayContaining(["goal", "been"]),
  });
});

it("skips the been step with no cities and opens the chart", () => {
  mocks.progress = {
    ...mocks.progress,
    goals: ["date"],
    beenCities: ["lisbon"],
  };
  startAt("been");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(saved()?.beenCities).toEqual([]);
  expect(screen.getByRole("button", { name: "chart:date" })).toBeTruthy();
});

it("goes back from the chart to the been step with its picks, also after a relaunch", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("been");
  render(<OnboardingScreen />);
  tap("been:lisbon");
  tap("been:continue");
  tap("common.back");
  expect(screen.getByText("been:picked:lisbon")).toBeTruthy();
  tap("been:continue");
  relaunch();
  expect(screen.getByRole("button", { name: "chart:date" })).toBeTruthy();
  tap("common.back");
  expect(screen.getByText("been:picked:lisbon")).toBeTruthy();
});

it("sends the been step's view once, even after going back and closing the app", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:continue");
  tap("common.back");
  relaunch();
  tap("goal:continue");
  expect(viewsOf("been_cities")).toHaveLength(1);
});

it("moves one step on a double tap", () => {
  startAt("ahaShare");
  render(<OnboardingScreen />);
  const share = screen.getByRole("button", { name: "aha:share" });
  fireEvent.click(share);
  fireEvent.click(share);
  expect(
    screen.getByRole("button", { name: "firstSave:continue" }),
  ).toBeTruthy();
});

it("sends a step's view once, even after going back and closing the app", () => {
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  tap("aha:spots");
  tap("common.back");
  relaunch();
  tap("aha:spots");
  expect(viewsOf("carousel")).toHaveLength(1);
});

it("reuses the sample for the carousel after the spots, before the paywall", async () => {
  mocks.progress = {
    ...mocks.progress,
    goals: ["travel"],
    travelCity: "lisbon",
  };
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  await act(async () => tap("aha:spots"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.carousel.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "lisbon",
  });
  await act(async () => tap("carousel:continue"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_step_completed",
    expect.objectContaining({ step_id: "carousel", skipped: false }),
  );
  expect(mocks.notifications.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "lisbon",
  });
  expect(saved()?.step).toBe(ONBOARDING_STEPS.indexOf("notifications"));
  await act(async () => tap("notifications:continue"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

it.each(["granted", "blocked"] as const)(
  "skips the notifications step when iOS already says %s",
  async (state) => {
    mocks.permission.mockResolvedValue(state);
    startAt("carousel");
    render(<OnboardingScreen />);
    await act(async () => tap("carousel:continue"));
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.notifications).not.toHaveBeenCalled();
  },
);

it("shows the carousel as leaving once its Continue asks for the paywall", async () => {
  mocks.permission.mockResolvedValue("blocked");
  startAt("carousel");
  render(<OnboardingScreen />);
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(false);
  await act(async () => tap("carousel:continue"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(true);
});

it("shows the carousel as leaving while it reads the notifications answer", async () => {
  let answer: (value: "blocked") => void = () => undefined;
  mocks.permission.mockImplementation(
    () => new Promise((resolve) => (answer = resolve)),
  );
  startAt("carousel");
  render(<OnboardingScreen />);
  tap("carousel:continue");
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(true);
  expect(mocks.ask).not.toHaveBeenCalled();
  await act(async () => answer("blocked"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(true);
});

it("opens the paywall when the permission cannot be read", async () => {
  mocks.permission.mockRejectedValue(new Error("no"));
  startAt("carousel");
  render(<OnboardingScreen />);
  await act(async () => tap("carousel:continue"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.captureError).toHaveBeenCalledTimes(1);
});

it.each(["granted", "blocked"] as const)(
  "stays on the earlier step when Back lands before iOS answers %s",
  async (state) => {
    let answer: (value: typeof state) => void = () => undefined;
    mocks.permission.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    startAt("carousel");
    render(<OnboardingScreen />);
    tap("carousel:continue");
    tap("common.back");
    await act(async () => answer(state));
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "aha:spots" })).toBeTruthy();
  },
);

it("ignores an answer from an earlier carousel visit", async () => {
  let answer: (value: "granted") => void = () => undefined;
  mocks.permission.mockImplementation(
    () => new Promise((resolve) => (answer = resolve)),
  );
  startAt("carousel");
  render(<OnboardingScreen />);
  tap("carousel:continue");
  tap("common.back");
  tap("aha:spots");
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(false);
  await act(async () => answer("granted"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "carousel:continue" }),
  ).toBeTruthy();
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(false);
});

it("keeps a later visit's Continue busy when an earlier visit's answer lands", async () => {
  const answers: ((value: "blocked") => void)[] = [];
  mocks.permission.mockImplementation(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  startAt("carousel");
  render(<OnboardingScreen />);
  tap("carousel:continue");
  tap("common.back");
  tap("aha:spots");
  tap("carousel:continue");
  await act(async () => answers[0]?.("blocked"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.carousel.mock.lastCall?.[0].leaving).toBe(true);
  await act(async () => answers[1]?.("blocked"));
  expect(mocks.ask).toHaveBeenCalledTimes(1);
});

it("returns from the notifications step to the same carousel without opening the paywall", () => {
  startAt("notifications");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(
    screen.getByRole("button", { name: "carousel:continue" }),
  ).toBeTruthy();
  expect(mocks.ask).not.toHaveBeenCalled();
});

it("hands the goals' spaces to the replay and reports the answers when onboarding ends", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("ahaSpots"),
    goals: ["date"],
    savedCount: "few",
    travelCity: "paris",
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.setPendingSpaces).toHaveBeenCalledWith(["Date nights"]);
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(ahaReelUrl(ahaReel("paris")));
  expect(mocks.completeOnboarding).toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_completed",
    expect.objectContaining({
      goal: "date",
      goals: ["date"],
      saved_count: "few",
      sample_city: "paris",
    }),
  );
});

it("queues the cities they have been to before leaving onboarding, and counts them", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("ahaSpots"),
    goals: ["date"],
    beenCities: ["lisbon", "madrid"],
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.queueCityStamps).toHaveBeenCalledWith(["lisbon", "madrid"]);
  expect(mocks.queueCityStamps.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.completeOnboarding.mock.invocationCallOrder[0],
  );
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_completed",
    expect.objectContaining({ been_count: 2 }),
  );
});

it("queues no cities for someone who signs in from the opener", () => {
  mocks.authenticated = true;
  mocks.progress = { ...mocks.progress, beenCities: ["lisbon"] };
  render(<OnboardingScreen />);
  tap("opener:signIn");
  tap("signIn:done");
  expect(mocks.completeOnboarding).toHaveBeenCalled();
  expect(mocks.queueCityStamps).not.toHaveBeenCalled();
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
    ahaReelUrl(ahaReel("austin")),
  );
});

it("queues the default reel before leaving onboarding when the city question was skipped", () => {
  mocks.progress = {
    ...mocks.progress,
    step: ONBOARDING_STEPS.indexOf("carousel"),
    goals: ["travel"],
    travelCity: null,
  };
  render(<OnboardingScreen />);
  act(() => mocks.paywall.onPro());
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(
    ahaReelUrl(ahaReel("austin")),
  );
  expect(mocks.queueDemoUrl.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.completeOnboarding.mock.invocationCallOrder[0],
  );
});

it.each([
  ["goal", "been:continue"],
  ["been", "chart:date"],
  ["chart", "city:date:out:lisbon"],
  ["cityEcho", "aha:share"],
  ["firstSave", "aha:spots"],
  ["ahaSpots", "carousel:continue"],
] as const)("moves on from %s when it is skipped", (step, next) => {
  mocks.progress = { ...mocks.progress, goals: ["date", "travel"] };
  startAt(step);
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(screen.getByRole("button", { name: next })).toBeTruthy();
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_step_completed",
    expect.objectContaining({
      step_id: ONBOARDING_STEP_IDS[step],
      flow_version: ONBOARDING_FLOW_VERSION,
      skipped: true,
    }),
  );
});

it("offers no Skip on the opener", () => {
  render(<OnboardingScreen />);
  expect(screen.queryByRole("button", { name: "onboardingQ.skip" })).toBeNull();
});

it("goes past the first-save moment to the spots when sharing is skipped, and back to the share", () => {
  startAt("ahaShare");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(screen.getByRole("button", { name: "aha:spots" })).toBeTruthy();
  expect(saved()).toMatchObject({
    step: ONBOARDING_STEPS.indexOf("ahaSpots"),
    skippedShare: true,
  });
  const completions = mocks.capture.mock.calls.filter(
    ([event, properties]) =>
      event === "onboarding_step_completed" &&
      properties.step_id === "aha_share",
  );
  expect(completions).toEqual([
    ["onboarding_step_completed", expect.objectContaining({ skipped: true })],
  ]);
  relaunch();
  tap("common.back");
  expect(screen.getByRole("button", { name: "aha:share" })).toBeTruthy();
});

it("saves no reel for someone who skipped sharing, and saves it once they share after all", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("ahaShare");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  act(() => mocks.paywall.onPro());
  expect(mocks.queueDemoUrl).not.toHaveBeenCalled();
  expect(mocks.completeOnboarding).toHaveBeenCalled();
  cleanup();
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  tap("common.back");
  tap("aha:share");
  expect(saved()?.skippedShare).toBe(false);
  act(() => mocks.paywall.onPro());
  expect(mocks.queueDemoUrl).toHaveBeenCalledWith(
    ahaReelUrl(ahaReel("austin")),
  );
});

it("hides Skip on the notifications step while iOS is asking", () => {
  startAt("notifications");
  render(<OnboardingScreen />);
  tap("notifications:asking");
  expect(screen.queryByRole("button", { name: "onboardingQ.skip" })).toBeNull();
});

it.each(["ask", "granted"] as const)(
  "records carousel Skip when notification permission is %s",
  async (state) => {
    mocks.permission.mockResolvedValue(state);
    startAt("carousel");
    render(<OnboardingScreen />);
    await act(async () => tap("onboardingQ.skip"));
    expect(mocks.ask).toHaveBeenCalledTimes(state === "ask" ? 0 : 1);
    if (state === "ask") {
      expect(
        screen.getByRole("button", { name: "notifications:continue" }),
      ).toBeTruthy();
    }
    expect(mocks.capture).toHaveBeenCalledWith(
      "onboarding_step_completed",
      expect.objectContaining({ step_id: "carousel", skipped: true }),
    );
  },
);

it("opens the paywall and reports a skip when the notifications step is skipped", () => {
  startAt("notifications");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledWith("onboarding_notifications", {
    action: "skip",
    granted: false,
  });
  expect(mocks.capture).toHaveBeenCalledWith(
    "onboarding_step_completed",
    expect.objectContaining({ step_id: "notification_ask", skipped: true }),
  );
});

it("sends the first-save view when someone skipped sharing, closed the app, then shared after all", () => {
  startAt("ahaShare");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  relaunch();
  tap("common.back");
  tap("aha:share");
  expect(viewsOf("first_save")).toHaveLength(1);
});
