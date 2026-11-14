// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StampMomentProvider } from "@/components/passport/stamp-moment";
import {
  STAMP_TIMING,
  type StampMoment,
  type StampSurface,
  useStampMoment,
} from "@/lib/stamp-moment";

const mocks = vi.hoisted(() => ({
  reduced: false,
  capture: vi.fn(),
  impact: vi.fn(),
  announce: vi.fn(),
}));

type Props = {
  children?: ReactNode;
  testID?: string;
  onPress?: () => void;
  accessibilityElementsHidden?: boolean;
  pointerEvents?: string;
};

vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: mocks.announce },
  Pressable: vi.fn(({ children, testID, onPress }: Props) => (
    <button data-testid={testID} onClick={onPress}>
      {children}
    </button>
  )),
  Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  View: vi.fn(({ children }: Props) => <div>{children}</div>),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(
      ({ children, accessibilityElementsHidden, pointerEvents }: Props) => (
        <div
          data-testid="animated"
          aria-hidden={accessibilityElementsHidden}
          data-pointer-events={pointerEvents}
        >
          {children}
        </div>
      ),
    ),
  },
  Easing: { bezier: () => (t: number) => t },
  FadeIn: chain(),
  FadeInDown: chain(),
  FadeOut: chain(),
  SlideInDown: chain(),
  SlideInLeft: chain(),
  SlideInRight: chain(),
  SlideOutDown: chain(),
  SlideOutLeft: chain(),
  SlideOutRight: chain(),
  cubicBezier: () => ({}),
  ReduceMotion: { Never: "never", System: "system" },
  useAnimatedStyle: (worklet: () => unknown) => worklet(),
  useReducedMotion: () => mocks.reduced,
  useSharedValue: (value: number) =>
    useState(() => ({ get: () => value, set: () => {} }))[0],
  withDelay: (_ms: number, value: unknown) => value,
  withSequence: (...values: unknown[]) => values.at(-1),
  withTiming: (to: number) => to,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFillObject: {},
  },
}));
vi.mock("@/components/passport/stamp-sheet", () => ({
  StampArt: vi.fn(({ cover, ink }: { cover: string | null; ink: string }) => (
    <figure data-cover={cover ?? "pin"}>{ink}</figure>
  )),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: vi.fn(),
  useNavigation: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/haptics", () => ({ haptics: { impact: mocks.impact } }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

function chain(): unknown {
  return new Proxy(() => {}, {
    get: () => () => chain(),
  });
}

function Surface({
  moment,
  surface,
}: {
  moment: StampMoment;
  surface: StampSurface;
}) {
  const { play } = useStampMoment();
  return (
    <button data-testid="stamp" onClick={() => play(moment, surface)}>
      city page
    </button>
  );
}

function mount(moment: StampMoment, surface: StampSurface) {
  render(
    <StampMomentProvider>
      <Surface moment={moment} surface={surface} />
    </StampMomentProvider>,
  );
}

const stamp = () => act(() => fireEvent.click(screen.getByTestId("stamp")));
const bulk: StampMoment = { kind: "bulk", count: 3, cover: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.reduced = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows the stamp and its line over the screen without hiding it", () => {
  mount(
    {
      kind: "place",
      name: "Tigre",
      city: "Lisbon",
      cover: "https://img/c.jpg",
      firstInCity: true,
    },
    "city",
  );
  expect(screen.getByText("city page")).toBeTruthy();
  expect(screen.queryByTestId("stamp-moment")).toBeNull();

  stamp();

  expect(screen.getByText("city page")).toBeTruthy();
  expect(
    screen.getByText('passport.momentFirstInCity {"city":"Lisbon"}'),
  ).toBeTruthy();
  const art = screen.getByText("Lisbon");
  expect(art.dataset.cover).toBe("https://img/c.jpg");
  const overlay = screen.getAllByTestId("animated")[0];
  expect(overlay.getAttribute("aria-hidden")).toBe("true");
  expect(overlay.dataset.pointerEvents).toBe("box-none");
  expect(mocks.capture).toHaveBeenCalledTimes(1);

  act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
  expect(screen.queryByTestId("stamp-moment")).toBeNull();
});

it("goes away on a tap", () => {
  mount(bulk, "already_been");
  stamp();
  expect(screen.getByText('passport.momentBulk {"count":3}')).toBeTruthy();
  expect(screen.getByText("passport.wentNoDate").dataset.cover).toBe("pin");

  fireEvent.click(screen.getByTestId("stamp-moment"));
  expect(screen.queryByTestId("stamp-moment")).toBeNull();
});

it("fades in place with no ink ring under Reduce Motion and still taps", () => {
  mocks.reduced = true;
  mount(bulk, "already_been");
  stamp();
  expect(screen.getAllByTestId("animated")).toHaveLength(3);
  expect(mocks.impact).toHaveBeenCalledWith("medium");

  mocks.reduced = false;
  cleanup();
  mount(bulk, "already_been");
  stamp();
  expect(screen.getAllByTestId("animated")).toHaveLength(4);
});
