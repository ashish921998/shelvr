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
  sharePractice: vi.fn(
    (_props: {
      title?: string;
      sample?: { domain: string; pageHeading: string };
    }) => null,
  ),
  promise: vi.fn((_props: { goal: string }) => null),
  reveal: vi.fn((_props: { trip: { kind: string; city: string } }) => null),
  progress: {
    spaces: [] as string[],
    step: 1,
    travelCity: null as string | null,
    goal: null as string | null,
  },
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
    payloads.length === 1 && payloads[0]!.value === url,
}));
vi.mock("@/lib/share/process-share", () => ({
  firstSharedUrl: (payloads: { value: string }[]) => payloads[0]?.value ?? null,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: vi.fn(),
  getOnboardingProgress: () => mocks.progress,
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
  PromiseStep: mocks.promise,
}));
vi.mock("@/components/onboarding/share-practice", () => ({
  SharePracticeStep: mocks.sharePractice,
}));
vi.mock("@/components/onboarding/trip-teaser", () => {
  const build = ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      built
    </button>
  );
  return { TripBuildStep: build, TripRevealStep: mocks.reveal };
});
vi.mock("@/components/onboarding/recipe-reveal", () => ({
  RecipeRevealStep: vi.fn(({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>
      recipe:continue
    </button>
  )),
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mocks.button,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/onboarding/goal", async () => {
  const { GOALS, GOAL_PLANS } = await import("@/lib/onboarding-goals");
  const { planCities } = await import("@/lib/sample-plans");
  const goals = ({ onPick }: { onPick: (goal: string) => void }) => (
    <div>
      {GOALS.map((goal) => (
        <button key={goal} type="button" onClick={() => onPick(goal)}>
          {`goal:${goal}`}
        </button>
      ))}
    </div>
  );
  const cities = ({
    goal,
    onPick,
  }: {
    goal: "travel" | "food" | "date";
    onPick: (city: string | null) => void;
  }) => (
    <div>
      {planCities(GOAL_PLANS[goal]!).map((city) => (
        <button key={city} type="button" onClick={() => onPick(city)}>
          {`city:${city}`}
        </button>
      ))}
      <button type="button" onClick={() => onPick(null)}>
        city:none
      </button>
    </div>
  );
  return { GoalStep: goals, CityStep: cities };
});
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

const chip = (id: string) =>
  screen.getByRole("checkbox", { name: onboardingLabel(id) });
const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const saved = () => mocks.setOnboardingProgress.mock.lastCall?.[0];
const shared = () => mocks.sharePractice.mock.lastCall?.[0].sample;

beforeEach(() => {
  mocks.setOnboardingProgress.mockClear();
  mocks.sharePractice.mockClear();
  mocks.promise.mockClear();
  mocks.reveal.mockClear();
  mocks.clearSharedPayloads.mockClear();
  mocks.payloads = [];
  mocks.progress = {
    spaces: [],
    step: ONBOARDING_STEPS.indexOf("goal"),
    travelCity: null,
    goal: null,
  };
});
afterEach(cleanup);

it("asks a date-night city, practises with a stop in that plan, then shows the plan and the promise", () => {
  render(<OnboardingScreen />);
  tap("goal:date");
  expect(screen.queryByRole("button", { name: "city:las-vegas" })).toBeNull();
  tap("city:paris");
  expect(saved()).toMatchObject({
    goal: "date",
    spaces: ["Date nights"],
    travelCity: "paris",
  });
  expect(shared()?.pageHeading).toBe("Pont des Arts");

  const { onFinish } = mocks.sharePractice.mock.lastCall?.[0] as unknown as {
    onFinish: () => void;
  };
  act(onFinish);
  tap("built");
  expect(mocks.reveal.mock.lastCall?.[0].trip).toMatchObject({
    kind: "date",
    city: "paris",
  });
  const { onContinue } = mocks.reveal.mock.lastCall?.[0] as unknown as {
    onContinue: () => void;
  };
  act(onContinue);
  expect(mocks.promise.mock.lastCall?.[0].goal).toBe("date");
});

it("moves one step on a double tap, so the build after the share practice still shows", () => {
  render(<OnboardingScreen />);
  tap("goal:date");
  tap("city:paris");
  const { onFinish } = mocks.sharePractice.mock.lastCall?.[0] as unknown as {
    onFinish: () => void;
  };
  act(() => {
    onFinish();
    onFinish();
  });
  expect(screen.getByRole("button", { name: "built" })).toBeTruthy();
  expect(mocks.reveal).not.toHaveBeenCalled();
});

it("skips the city for recipes, practises with the recipe post, then shows the recipe and the promise", () => {
  render(<OnboardingScreen />);
  tap("goal:recipes");
  expect(screen.queryByRole("button", { name: "city:paris" })).toBeNull();
  expect(saved()).toMatchObject({ goal: "recipes", spaces: ["Recipes"] });
  const practice = mocks.sharePractice.mock.lastCall?.[0];
  expect(practice?.title).toBe("goal.shareRecipes");
  expect(practice?.sample?.domain).toBe("bbcgoodfood.com");

  const { onFinish } = practice as unknown as { onFinish: () => void };
  act(onFinish);
  expect(mocks.reveal).not.toHaveBeenCalled();
  tap("recipe:continue");
  expect(mocks.promise.mock.lastCall?.[0].goal).toBe("recipes");
});

it("shows a food weekend in Prague when the city is somewhere else", () => {
  render(<OnboardingScreen />);
  tap("goal:food");
  tap("city:none");
  expect(saved()).toMatchObject({
    goal: "food",
    spaces: ["Restaurants to try"],
  });
  expect(shared()?.pageHeading).toBe("U Fleků");
});

it("keeps today's topics for something else, and moves on only once one is picked", () => {
  render(<OnboardingScreen />);
  tap("goal:other");
  const next = screen.getByRole("button", { name: "common.continue" });
  expect(next.hasAttribute("disabled")).toBe(true);
  expect(
    screen.queryByRole("checkbox", { name: onboardingLabel("Travel") }),
  ).toBeNull();

  fireEvent.click(chip("AI & tech"));
  expect(saved()).toMatchObject({ goal: "other", spaces: ["AI & tech"] });
  fireEvent.click(next);
  expect(shared()?.domain).toBe("anthropic.com");
});

it("starts the shelf again when a different goal is picked", () => {
  mocks.progress = {
    spaces: ["AI & tech"],
    step: ONBOARDING_STEPS.indexOf("goal"),
    travelCity: null,
    goal: "other",
  };
  render(<OnboardingScreen />);
  tap("goal:travel");
  expect(saved()).toMatchObject({ goal: "travel", spaces: ["Travel"] });
});

it.each([
  [
    "a topic's post",
    "https://www.anthropic.com/research/building-effective-agents",
  ],
  ["a date-night post", "https://en.wikipedia.org/wiki/Pont_des_Arts"],
])("drops a declined practice share of %s", (_name, url) => {
  render(<OnboardingScreen />);
  mocks.payloads = [{ value: url, shareType: "url" }];
  mocks.paywall.onDecline();
  expect(mocks.clearSharedPayloads).toHaveBeenCalledTimes(1);
});

it("keeps a link the person shared on their own when the paywall is declined", () => {
  render(<OnboardingScreen />);
  mocks.payloads = [{ value: "https://example.com/my-own", shareType: "url" }];
  mocks.paywall.onDecline();
  expect(mocks.clearSharedPayloads).not.toHaveBeenCalled();
});
