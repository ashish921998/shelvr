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
  queueBeenCities: vi.fn(),
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
    planner: null as string | null,
    tripSoon: null as string | null,
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
vi.mock("@/lib/pending-been-cities", () => ({
  queueBeenCities: mocks.queueBeenCities,
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
  TripSoonStep: vi.fn(({ onPick }: { onPick: (answer: string) => void }) => (
    <div>
      {button("trip:soon", () => onPick("soon"))}
      {button("trip:notYet", () => onPick("notYet"))}
    </div>
  )),
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
  CarouselStep: vi.fn((props: { sample: Sample; onContinue: () => void }) => {
    mocks.carousel(props);
    return button("carousel:continue", props.onContinue);
  }),
}));
vi.mock("@/components/onboarding/notifications", () => ({
  NotificationsStep: vi.fn(
    (props: { sample: Sample; onContinue: () => void }) => {
      mocks.notifications(props);
      return button("notifications:continue", props.onContinue);
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
    planner: null,
    tripSoon: null,
    viewed: [],
  };
});
afterEach(cleanup);

it("walks the questions, the trip question, the chart and the city echo into a sample for the goal that leads, and keeps every answer", () => {
  render(<OnboardingScreen />);
  tap("opener:start");
  tap("count:hundreds");
  tap("count:continue");
  tap("goal:food");
  tap("goal:travel");
  tap("goal:continue");
  tap("trip:soon");
  tap("planner:explorer");
  tap("planner:continue");
  tap("been:lisbon");
  tap("been:continue");
  tap("chart:trip");
  tap("city:trip:trip:lisbon");
  expect(saved()).toMatchObject({
    goals: ["food", "travel"],
    spaces: ["Travel", "Restaurants to try"],
    savedCount: "hundreds",
    planner: "explorer",
    tripSoon: "soon",
    beenCities: ["lisbon"],
    travelCity: "lisbon",
    step: ONBOARDING_STEPS.indexOf("cityEcho"),
  });
  expect(screen.getByText("onboardingStatement.cityFirst")).toBeTruthy();
  tap("statement");
  expect(mocks.share.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "austin",
  });
});

it("praises the city only when the demo plays that city's reel", () => {
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

it("asks about a trip when the goal question is skipped, and plans for every goal", () => {
  startAt("goal");
  render(<OnboardingScreen />);
  tap("onboardingQ.skip");
  expect(saved()?.goals).toEqual(["date", "travel", "food"]);
  expect(screen.getByRole("button", { name: "trip:soon" })).toBeTruthy();
});

it("asks about a trip when the goal question is skipped after picking a goal without travel", () => {
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:food");
  tap("onboardingQ.skip");
  expect(saved()?.goals).toEqual(["date", "travel", "food"]);
  expect(screen.getByRole("button", { name: "trip:soon" })).toBeTruthy();
});

it("skips the trip question when the goals carry no travel", () => {
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:food");
  tap("goal:continue");
  expect(screen.getByRole("button", { name: "planner:continue" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "trip:soon" })).toBeNull();
});

it("moves on from the trip question on one tap and asks for a dream city after a no", () => {
  mocks.progress = { ...mocks.progress, goals: ["date", "travel", "food"] };
  startAt("tripSoon");
  render(<OnboardingScreen />);
  tap("trip:notYet");
  expect(saved()).toMatchObject({ tripSoon: "notYet" });
  tap("planner:continue");
  tap("been:continue");
  tap("chart:date");
  expect(
    screen.getByRole("button", { name: "city:date:dream:lisbon" }),
  ).toBeTruthy();
});

it("asks where a person goes out when no trip is planned", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"], tripSoon: "soon" };
  startAt("planner");
  render(<OnboardingScreen />);
  tap("planner:continue");
  tap("been:continue");
  tap("chart:date");
  expect(
    screen.getByRole("button", { name: "city:date:out:lisbon" }),
  ).toBeTruthy();
});

it("goes back from a question, over a skipped trip question, and from the sample", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("planner");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "goal:continue" })).toBeTruthy();
  cleanup();
  mocks.progress = { ...mocks.progress, goals: ["travel"] };
  startAt("planner");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(screen.getByRole("button", { name: "trip:soon" })).toBeTruthy();
  cleanup();
  startAt("ahaSpots");
  render(<OnboardingScreen />);
  tap("common.back");
  expect(
    screen.getByRole("button", { name: "firstSave:continue" }),
  ).toBeTruthy();
});

it("asks where they have been after the planner, and keeps the picks with the progress", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("planner");
  render(<OnboardingScreen />);
  tap("planner:continue");
  tap("been:lisbon");
  expect(saved()).toMatchObject({
    beenCities: ["lisbon"],
    step: ONBOARDING_STEPS.indexOf("been"),
    viewed: expect.arrayContaining(["planner", "been"]),
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
  startAt("planner");
  render(<OnboardingScreen />);
  tap("planner:continue");
  tap("common.back");
  relaunch();
  tap("planner:continue");
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

it("still sends the trip question's first view after going back to add Trips and closing the app", () => {
  mocks.progress = { ...mocks.progress, goals: ["date"] };
  startAt("goal");
  render(<OnboardingScreen />);
  tap("goal:continue");
  tap("common.back");
  tap("goal:travel");
  relaunch();
  tap("goal:continue");
  expect(viewsOf("trip_soon")).toHaveLength(1);
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
    city: "austin",
  });
  await act(async () => tap("carousel:continue"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.notifications.mock.lastCall?.[0].sample).toMatchObject({
    kind: "trip",
    city: "austin",
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
  await act(async () => answer("granted"));
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "carousel:continue" }),
  ).toBeTruthy();
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
      trip_soon: null,
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
  expect(mocks.queueBeenCities).toHaveBeenCalledWith(["lisbon", "madrid"]);
  expect(mocks.queueBeenCities.mock.invocationCallOrder[0]).toBeLessThan(
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
  expect(mocks.queueBeenCities).not.toHaveBeenCalled();
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
    step: ONBOARDING_STEPS.indexOf("carousel"),
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
