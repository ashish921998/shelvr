// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ahaSample } from "@/lib/aha-sample";
import { planKindFor, type Goal } from "@/lib/onboarding-goals";
import en from "@/locales/en.json";
import { ONBOARDING_FLOW_VERSION } from "@/lib/onboarding-steps";
import { CommitmentStep } from "./commitment";

type Children = { children?: ReactNode };
const mocks = vi.hoisted(() => ({
  map: vi.fn(),
  haptic: vi.fn(),
  capture: vi.fn(),
  progress: { value: 0, set: vi.fn() },
  reduced: false,
  stateChange: (_state: string) => {},
  accessibilityTap: () => {},
  accessibilityAction: (_event: { nativeEvent: { actionName: string } }) => {},
  accessibilityActions: [] as { name: string }[],
  longPress: () => {},
  delayLongPress: 0,
  remove: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture },
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: keyof typeof en, params?: { city?: string; places?: string }) =>
    String(en[key]).replace("%{city}", params?.city ?? ""),
  useAppLocale: () => {},
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: Children) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: Children) => <div>{children}</div>),
  Text: vi.fn(
    ({
      children,
      accessibilityLiveRegion,
    }: Children & {
      accessibilityLiveRegion?: "polite";
    }) => <span aria-live={accessibilityLiveRegion}>{children}</span>,
  ),
  Pressable: vi.fn(
    (
      props: Children & {
        onPressIn: () => void;
        onPressOut: () => void;
        onAccessibilityTap: () => void;
        onAccessibilityAction: (event: {
          nativeEvent: { actionName: string };
        }) => void;
        accessibilityActions: { name: string }[];
        onLongPress: () => void;
        delayLongPress: number;
        disabled: boolean;
        accessibilityLabel: string;
      },
    ) => {
      mocks.accessibilityTap = props.onAccessibilityTap;
      mocks.accessibilityAction = props.onAccessibilityAction;
      mocks.accessibilityActions = props.accessibilityActions;
      mocks.longPress = props.onLongPress;
      mocks.delayLongPress = props.delayLongPress;
      return (
        <button
          type="button"
          aria-label={props.accessibilityLabel}
          disabled={props.disabled}
          onMouseDown={props.onPressIn}
          onMouseUp={props.onPressOut}
          onMouseLeave={props.onPressOut}
        >
          {props.children}
        </button>
      );
    },
  ),
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.stateChange = listener;
      return { remove: mocks.remove };
    },
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFill: {} },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native-reanimated", () => ({
  cancelAnimation: vi.fn(),
  Easing: { linear: vi.fn() },
  useSharedValue: () => mocks.progress,
  useReducedMotion: () => mocks.reduced,
  withTiming: () => 0,
}));
vi.mock("@shopify/react-native-skia", () => ({
  Canvas: vi.fn(() => null),
  Group: vi.fn(() => null),
  Circle: vi.fn(() => null),
  Path: vi.fn(() => null),
  Skia: {
    PathBuilder: {
      Make: vi.fn(() => ({ addCircle: vi.fn(() => ({ detach: vi.fn() })) })),
    },
  },
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: mocks.haptic,
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/onboarding/sample-apple-map", () => ({
  SampleAppleMap: vi.fn((props: unknown) => {
    mocks.map(props);
    return <div data-testid="map" />;
  }),
}));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  SampleTripMap: vi.fn((props: unknown) => {
    mocks.map(props);
    return <div data-testid="map" />;
  }),
  PinBadge: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/parts", () => {
  const button = ({
    label,
    onPress,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled || busy}>
      {label}
    </button>
  );
  return { GhostButton: button, PillButton: button };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.reduced = false;
  mocks.progress.value = 0;
  mocks.progress.set.mockImplementation((value: number) => {
    mocks.progress.value = value;
  });
  vi.stubEnv("EXPO_OS", "ios");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const holdButton = () => screen.getByRole("button", { name: "Hold to commit" });
const advanceTime = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const recognizeLongPress = () => act(() => mocks.longPress());
const renderStep = (
  goals: Goal[] = ["travel"],
  city: "lisbon" | null = "lisbon",
) => {
  const sample = ahaSample(planKindFor(goals), city);
  const onContinue = vi.fn();
  const result = render(
    <CommitmentStep sample={sample} leaving={false} onContinue={onContinue} />,
  );
  return { ...result, sample, onContinue };
};

it("has one live confirmation announcement", () => {
  const { container } = renderStep();
  fireEvent.click(
    screen.getByRole("button", { name: "Tap to commit instead" }),
  );
  const announcements = container.querySelectorAll('[aria-live="polite"]');
  expect(announcements).toHaveLength(1);
  expect(announcements[0].textContent).toBe(en["commitment.confirmed"]);
  expect(screen.getByText(en["commitment.made"])).toBeTruthy();
});

it.each<Goal[]>([
  ["travel"],
  ["date"],
  ["food"],
  ["food", "travel"],
  ["date", "travel"],
  [],
])("uses the demo's leading goal for %j", (...goals) => {
  const { sample } = renderStep(goals);
  const promise =
    sample.kind === "trip"
      ? "I’ll visit one saved place on my Austin trip."
      : "I’ll visit one place I saved in Austin this week.";
  expect(screen.getByText(promise)).toBeTruthy();
  for (const spot of sample.spots)
    expect(screen.getByText(spot.name)).toBeTruthy();
  expect(mocks.map).toHaveBeenLastCalledWith(
    expect.objectContaining({ trip: sample.trip }),
  );
});

it("uses the demo's fallback city when the city question was skipped", () => {
  renderStep(["travel"], null);
  expect(
    screen.getByText("I’ll visit one saved place on my Austin trip."),
  ).toBeTruthy();
});

it("delegates the one-second threshold to Pressable, confirms in place, and waits for Continue", () => {
  const { onContinue } = renderStep();
  const map = screen.getByTestId("map");
  expect(mocks.delayLongPress).toBe(1000);
  fireEvent.mouseDown(holdButton());
  advanceTime(999);
  expect(screen.queryByText("You’re in.")).toBeNull();
  advanceTime(1);
  expect(screen.queryByText("You’re in.")).toBeNull();
  recognizeLongPress();
  fireEvent.mouseUp(holdButton());
  expect(screen.getByText("You’re in.")).toBeTruthy();
  expect(screen.getByTestId("map")).toBe(map);
  expect(
    screen.getByText("I’ll visit one saved place on my Austin trip."),
  ).toBeTruthy();
  expect(mocks.haptic).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "onboarding_commitment",
    {
      action: "confirmed",
      plan_kind: "trip",
      sample_city: "austin",
      flow_version: ONBOARDING_FLOW_VERSION,
    },
  );
  expect(onContinue).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledTimes(1);
});

it("resets early releases and requires a fresh full hold", () => {
  renderStep();
  fireEvent.mouseDown(holdButton());
  advanceTime(800);
  fireEvent.mouseUp(holdButton());
  advanceTime(1000);
  recognizeLongPress();
  expect(screen.queryByText("You’re in.")).toBeNull();
  expect(mocks.progress.value).toBe(0);
  expect(mocks.capture).not.toHaveBeenCalled();
  fireEvent.mouseDown(holdButton());
  advanceTime(999);
  expect(screen.queryByText("You’re in.")).toBeNull();
  advanceTime(1);
  recognizeLongPress();
  expect(screen.getByText("You’re in.")).toBeTruthy();
});

it.each(["inactive", "background"])(
  "cancels when the app becomes %s",
  (state) => {
    renderStep();
    fireEvent.mouseDown(holdButton());
    advanceTime(500);
    act(() => mocks.stateChange(state));
    advanceTime(1000);
    recognizeLongPress();
    expect(screen.queryByText("You’re in.")).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  },
);

it("cleans up an unfinished hold when leaving the screen", () => {
  const { unmount } = renderStep();
  fireEvent.mouseDown(holdButton());
  unmount();
  advanceTime(1000);
  recognizeLongPress();
  expect(mocks.haptic).not.toHaveBeenCalled();
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledOnce();
});

it("offers a tap alternative and accessibility activation without opening the paywall", () => {
  const { onContinue } = renderStep();
  fireEvent.click(
    screen.getByRole("button", { name: "Tap to commit instead" }),
  );
  act(() => mocks.accessibilityTap());
  expect(screen.getByText("You’re in.")).toBeTruthy();
  expect(mocks.haptic).toHaveBeenCalledOnce();
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "onboarding_commitment",
    {
      action: "confirmed",
      plan_kind: "trip",
      sample_city: "austin",
      flow_version: ONBOARDING_FLOW_VERSION,
    },
  );
  expect(onContinue).not.toHaveBeenCalled();
});

it("allows screen-reader activation directly", () => {
  renderStep();
  act(() => mocks.accessibilityTap());
  expect(screen.getByText("You’re in.")).toBeTruthy();
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "onboarding_commitment",
    {
      action: "confirmed",
      plan_kind: "trip",
      sample_city: "austin",
      flow_version: ONBOARDING_FLOW_VERSION,
    },
  );
});

it("supports TalkBack activation without holding, and ignores unrelated actions", () => {
  vi.stubEnv("EXPO_OS", "android");
  const { onContinue } = renderStep();
  expect(mocks.accessibilityActions).toEqual([{ name: "activate" }]);
  act(() =>
    mocks.accessibilityAction({ nativeEvent: { actionName: "longpress" } }),
  );
  expect(mocks.capture).not.toHaveBeenCalled();
  act(() =>
    mocks.accessibilityAction({ nativeEvent: { actionName: "activate" } }),
  );
  act(() =>
    mocks.accessibilityAction({ nativeEvent: { actionName: "activate" } }),
  );
  expect(screen.getByText("You’re in.")).toBeTruthy();
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(mocks.haptic).not.toHaveBeenCalled();
  expect(onContinue).not.toHaveBeenCalled();
});

it("allows skipping without making a promise", () => {
  const { onContinue } = renderStep();
  fireEvent.mouseDown(holdButton());
  advanceTime(500);
  fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
  advanceTime(1000);
  recognizeLongPress();
  expect(onContinue).toHaveBeenCalledOnce();
  expect(screen.queryByText("You’re in.")).toBeNull();
  expect(mocks.haptic).not.toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "onboarding_commitment",
    {
      action: "skipped",
      plan_kind: "trip",
      sample_city: "austin",
      flow_version: ONBOARDING_FLOW_VERSION,
    },
  );
});

it("does not count paywall retries as new skips, and can record a later confirmation", () => {
  const { onContinue } = renderStep(["food"], null);
  const later = screen.getByRole("button", { name: "Maybe later" });
  fireEvent.click(later);
  fireEvent.click(later);
  expect(onContinue).toHaveBeenCalledTimes(2);
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "onboarding_commitment",
    {
      action: "skipped",
      plan_kind: "weekend",
      sample_city: "austin",
      flow_version: ONBOARDING_FLOW_VERSION,
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Tap to commit instead" }),
  );
  act(() => mocks.accessibilityTap());
  expect(mocks.capture).toHaveBeenCalledTimes(2);
  expect(mocks.capture).toHaveBeenLastCalledWith("onboarding_commitment", {
    action: "confirmed",
    plan_kind: "weekend",
    sample_city: "austin",
    flow_version: ONBOARDING_FLOW_VERSION,
  });
});

it("keeps the hold duration under Reduce Motion and disables Continue while opening the paywall", () => {
  mocks.reduced = true;
  const { rerender, sample, onContinue } = renderStep();
  fireEvent.mouseDown(holdButton());
  advanceTime(999);
  expect(mocks.progress.value).toBe(0);
  advanceTime(1);
  recognizeLongPress();
  expect(screen.getByText("You’re in.")).toBeTruthy();
  rerender(<CommitmentStep sample={sample} leaving onContinue={onContinue} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onContinue).not.toHaveBeenCalled();
});
