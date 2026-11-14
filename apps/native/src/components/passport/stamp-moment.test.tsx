// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StampMomentProvider } from "@/components/passport/stamp-moment";
import {
  BADGE_TIMING,
  STAMP_TIMING,
  type StampMoment,
  type StampSurface,
  useStampMoment,
} from "@/lib/stamp-moment";

const mocks = vi.hoisted(() => ({
  reduced: false,
  capture: vi.fn(),
  impact: vi.fn(),
  success: vi.fn(),
  announce: vi.fn(),
  share: vi.fn(),
  unlock: (_ids: string[]) => {},
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
      ({
        children,
        testID,
        accessibilityElementsHidden,
        pointerEvents,
      }: Props) => (
        <div
          data-testid={testID ?? "animated"}
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
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/badges", () => ({
  useBadgeUnlocks: (unlock: (ids: string[]) => void) => {
    mocks.unlock = unlock;
  },
  useShareBadge: () => mocks.share,
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
vi.mock("@/lib/haptics", () => ({
  haptics: { impact: mocks.impact, success: mocks.success },
}));
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
      completedTotal: null,
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

const lisbon: StampMoment = {
  kind: "place",
  name: "Tigre",
  city: "Lisbon",
  cover: null,
  firstInCity: false,
  completedTotal: null,
};

const unlock = (ids: string[]) => act(() => mocks.unlock(ids));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const badgeShown = () => screen.queryByTestId("badge-moment") !== null;

describe("badge unlock moment", () => {
  it("plays a badge the stamp earned once the stamp moment ends", () => {
    mount(lisbon, "city");
    stamp();
    unlock(["explorer"]);
    wait(BADGE_TIMING.grace);
    expect(screen.getByTestId("stamp-moment")).toBeTruthy();
    expect(badgeShown()).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();

    wait(STAMP_TIMING.shown);
    expect(screen.queryByTestId("stamp-moment")).toBeNull();
    expect(badgeShown()).toBe(true);
    expect(screen.getByText("badges.explorer")).toBeTruthy();
    expect(screen.getByText("badges.earned")).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith("passport_badge_unlocked", {
      badge: "explorer",
    });
    expect(mocks.announce).toHaveBeenLastCalledWith(
      'badges.unlocked {"badge":"badges.explorer"}',
    );
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    wait(BADGE_TIMING.flip);
    expect(mocks.success).toHaveBeenCalledTimes(1);

    wait(BADGE_TIMING.shown);
    expect(badgeShown()).toBe(false);
  });

  it("waits for the stamp when the new badge arrives first", () => {
    mount(lisbon, "city");
    unlock(["firstStamp"]);
    stamp();
    wait(BADGE_TIMING.grace);
    expect(badgeShown()).toBe(false);
    fireEvent.click(screen.getByTestId("stamp-moment"));
    expect(badgeShown()).toBe(true);
    expect(screen.getByText("badges.firstStamp")).toBeTruthy();
  });

  it("holds a badge while its stamp waits to be released", () => {
    function Queued() {
      const { queue } = useStampMoment();
      return (
        <button data-testid="queue" onClick={() => queue(bulk, "already_been")}>
          queue
        </button>
      );
    }
    render(
      <StampMomentProvider>
        <Queued />
      </StampMomentProvider>,
    );
    fireEvent.click(screen.getByTestId("queue"));
    unlock(["cityHopper"]);
    wait(BADGE_TIMING.grace);
    expect(badgeShown()).toBe(false);
  });

  it("shows nothing for a badge no stamp earned", () => {
    mount(lisbon, "city");
    unlock(["completionist"]);
    wait(BADGE_TIMING.window + 1);
    expect(badgeShown()).toBe(false);
    stamp();
    wait(STAMP_TIMING.shown);
    expect(badgeShown()).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "passport_badge_unlocked",
      expect.anything(),
    );
  });

  it("plays Passport holder when the third country lands long after the stamp", () => {
    mount(bulk, "already_been");
    stamp();
    unlock(["firstStamp"]);
    wait(STAMP_TIMING.shown + BADGE_TIMING.grace);
    expect(screen.getByText("badges.firstStamp")).toBeTruthy();
    wait(BADGE_TIMING.shown + BADGE_TIMING.window);
    expect(badgeShown()).toBe(false);
    unlock(["passportHolder"]);
    wait(BADGE_TIMING.grace);
    expect(screen.getByText("badges.passportHolder")).toBeTruthy();
  });

  it("lets a showing badge finish before a late one takes its place", () => {
    mount(bulk, "already_been");
    stamp();
    unlock(["firstStamp"]);
    wait(STAMP_TIMING.shown + BADGE_TIMING.grace);
    expect(screen.getByText("badges.firstStamp")).toBeTruthy();
    unlock(["passportHolder"]);
    wait(BADGE_TIMING.grace);
    expect(screen.getByText("badges.firstStamp")).toBeTruthy();
    wait(BADGE_TIMING.shown);
    expect(screen.getByText("badges.passportHolder")).toBeTruthy();
  });

  it("holds a late country badge while a stamp moment plays", () => {
    mount(lisbon, "city");
    stamp();
    unlock(["passportHolder"]);
    wait(BADGE_TIMING.grace);
    expect(badgeShown()).toBe(false);
    wait(STAMP_TIMING.shown);
    expect(screen.getByText("badges.passportHolder")).toBeTruthy();
  });

  it("leads with the first badge in table order and counts the rest", () => {
    mount(bulk, "already_been");
    stamp();
    unlock(["coffeeCrawler", "firstStamp"]);
    unlock(["explorer"]);
    wait(STAMP_TIMING.shown);
    expect(screen.getByText("badges.firstStamp")).toBeTruthy();
    expect(screen.getByText('badges.moreEarned {"count":2}')).toBeTruthy();
    expect(
      mocks.capture.mock.calls
        .filter(([event]) => event === "passport_badge_unlocked")
        .map(([, props]) => (props as { badge: string }).badge),
    ).toEqual(["firstStamp", "explorer", "coffeeCrawler"]);
  });

  it("flips in under Reduce Motion with the haptic at once", () => {
    mocks.reduced = true;
    mount(lisbon, "city");
    stamp();
    unlock(["explorer"]);
    wait(STAMP_TIMING.shown);
    expect(badgeShown()).toBe(true);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("shares the badge and goes away on a tap", () => {
    mount(lisbon, "city");
    stamp();
    unlock(["sweetTooth"]);
    wait(STAMP_TIMING.shown);
    fireEvent.click(screen.getByTestId("badge-moment-share"));
    expect(mocks.share).toHaveBeenCalledWith("sweetTooth");
    expect(badgeShown()).toBe(true);
    fireEvent.click(screen.getByTestId("badge-moment-dismiss"));
    expect(badgeShown()).toBe(false);
  });

  it("gives way to the next stamp", () => {
    mount(lisbon, "city");
    stamp();
    unlock(["explorer"]);
    wait(STAMP_TIMING.shown);
    expect(badgeShown()).toBe(true);
    stamp();
    expect(badgeShown()).toBe(false);
    expect(screen.getByTestId("stamp-moment")).toBeTruthy();
  });
});

it("stamps a city with the round city stamp, not a place cover", () => {
  mount({ kind: "city", city: "Lisbon" }, "city_stamps");

  stamp();

  expect(
    screen.getByText('passport.momentCityStamp {"city":"Lisbon"}'),
  ).toBeTruthy();
  expect(screen.getByText("Lisbon").closest("figure")).toBeNull();
  expect(mocks.capture).toHaveBeenCalledWith("passport_stamp_landed", {
    surface: "city_stamps",
    first_in_city: false,
    count: 1,
  });
});
