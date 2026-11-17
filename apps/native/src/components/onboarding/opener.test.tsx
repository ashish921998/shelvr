// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Children = { children?: ReactNode };
type ScrollEvent = {
  nativeEvent: {
    contentOffset: { x: number };
    layoutMeasurement: { width: number };
  };
};

const VIEWPORT_WIDTH = 390;
const PAGE_STRIDE = 265;
const FIRST_PAGE_INDEX = 2;

const mock = vi.hoisted(() => {
  const styleNames = (style: unknown): string =>
    (Array.isArray(style) ? style.flat(Infinity) : [style])
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as { __name?: string }).__name
          : undefined,
      )
      .filter((name): name is string => typeof name === "string")
      .join(" ");
  return {
    capture: vi.fn(),
    largeText: false,
    reducedMotion: false,
    reduceMotionAtMount: false,
    screenReader: false,
    scrollTo: vi.fn(),
    pager: null as null | ((event: ScrollEvent) => void),
    settle: null as null | ((event: ScrollEvent) => void),
    beginDrag: null as null | (() => void),
    pageDrag: null as null | (() => void),
    reduceMotionChanged: null as null | ((enabled: boolean) => void),
    image: () => null,
    wordmark: () => <span>shelvr</span>,
    styleNames,
    text: ({ children }: Children) => <span>{children}</span>,
    pressable: ({ children, onPress }: Children & { onPress?: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
    phone: ({ children }: Children) => <div>{children}</div>,
  };
});

vi.mock("react-native", async () => {
  const { useEffect, useImperativeHandle, useRef } = await import("react");
  const View = ({
    children,
    testID,
    style,
    onLayout,
    accessibilityLabel,
  }: Children & {
    testID?: string;
    style?: unknown;
    onLayout?: (event: unknown) => void;
    accessibilityLabel?: string;
  }) => {
    const laidOut = useRef(false);
    useEffect(() => {
      if (!onLayout || laidOut.current) return;
      laidOut.current = true;
      onLayout({
        nativeEvent: { layout: { width: VIEWPORT_WIDTH, height: 530 } },
      });
    }, [onLayout]);
    return (
      <div
        aria-label={accessibilityLabel}
        data-testid={testID}
        data-style={mock.styleNames(style)}
      >
        {children}
      </div>
    );
  };
  const ScrollView = ({
    ref,
    children,
    horizontal,
    onScroll,
    onScrollBeginDrag,
    onMomentumScrollEnd,
  }: Children & {
    ref?: React.Ref<{
      scrollTo: (to: { x: number; animated: boolean }) => void;
    }>;
    horizontal?: boolean;
    onScroll?: (event: ScrollEvent) => void;
    onScrollBeginDrag?: () => void;
    onMomentumScrollEnd?: (event: ScrollEvent) => void;
  }) => {
    if (horizontal && onScroll) mock.pager = onScroll;
    if (horizontal && onMomentumScrollEnd) mock.settle = onMomentumScrollEnd;
    if (horizontal && onScrollBeginDrag) mock.beginDrag = onScrollBeginDrag;
    if (!horizontal && onScrollBeginDrag) mock.pageDrag = onScrollBeginDrag;
    useImperativeHandle(ref, () => ({
      scrollTo: (options: { x: number; animated: boolean }) => {
        mock.scrollTo(options);
        const { x } = options;
        const event = {
          nativeEvent: {
            contentOffset: { x },
            layoutMeasurement: { width: VIEWPORT_WIDTH },
          },
        };
        onScroll?.(event);
      },
    }));
    return <div>{children}</div>;
  };
  return {
    View,
    Text: mock.text,
    Pressable: mock.pressable,
    ScrollView,
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(mock.reduceMotionAtMount),
      isScreenReaderEnabled: () => Promise.resolve(mock.screenReader),
      addEventListener: (event: string, listener: (on: boolean) => void) => {
        if (event === "reduceMotionChanged")
          mock.reduceMotionChanged = listener;
        return { remove: () => (mock.reduceMotionChanged = null) };
      },
    },
  };
});
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () =>
      new Proxy({}, { get: (_target, key) => ({ __name: String(key) }) }),
  },
}));
vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: () => ({ set: vi.fn() }),
    useReducedMotion: () => mock.reducedMotion,
  };
});
vi.mock("expo-image", () => ({ Image: mock.image }));
vi.mock("@/components/wordmark", () => ({
  Wordmark: mock.wordmark,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({
  useLargeText: () => mock.largeText,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture },
}));
vi.mock("@/components/onboarding/opener-phone", () => ({
  PhoneFrame: mock.phone,
  FULL_PHONE_HEIGHT: 490,
  FULL_PHONE_WIDTH: 236,
}));

const { OpenerStep } = await import("@/components/onboarding/opener");

const swipeTo = (index: number) =>
  act(() => {
    const event = {
      nativeEvent: {
        contentOffset: { x: (index + FIRST_PAGE_INDEX) * PAGE_STRIDE },
        layoutMeasurement: { width: VIEWPORT_WIDTH },
      },
    };
    mock.pager?.(event);
    mock.settle?.(event);
  });

const dot = (index: number) =>
  screen.getByTestId(`opener-dot-${index}`).getAttribute("data-style") ?? "";

const pageViews = () =>
  mock.capture.mock.calls
    .filter(([event]) => event === "onboarding_opener_page_viewed")
    .map(([, props]) => (props as { page_index: number }).page_index);

beforeEach(() => {
  vi.clearAllMocks();
  mock.largeText = false;
  mock.reducedMotion = false;
  mock.reduceMotionAtMount = false;
  mock.screenReader = false;
  mock.pager = null;
  mock.settle = null;
  mock.beginDrag = null;
  mock.pageDrag = null;
  mock.reduceMotionChanged = null;
  vi.useRealTimers();
});

const renderOpener = () =>
  render(
    <OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} viewedPages={new Set()} />,
  );

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("OpenerStep", () => {
  it("shows a stable tagline and labels the four previews for assistive technology", () => {
    renderOpener();
    expect(screen.getByText("opener.tagline")).toBeTruthy();
    expect(screen.getByText("opener.yourCities")).toBeTruthy();
    expect(screen.getByLabelText("opener.yourCities")).toBeTruthy();
    swipeTo(1);
    expect(
      screen.getByText(
        "onboarding.openerFileTitle onboarding.openerFileAccent",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("opener.yourCities")).toBeNull();
    expect(
      screen.getByLabelText(/openerFileTitle.*openerFileBody/),
    ).toBeTruthy();
    swipeTo(2);
    expect(screen.getByText("plan.dateNight")).toBeTruthy();
    expect(screen.getByLabelText("plan.dateNight")).toBeTruthy();
    swipeTo(3);
    expect(screen.getByText("trip.yourTripNoCity")).toBeTruthy();
    expect(screen.getByLabelText("trip.yourTripNoCity")).toBeTruthy();
    expect(screen.getByText("opener.tagline")).toBeTruthy();
  });

  it("lights the dot of the page in view", () => {
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    expect(dot(0)).toContain("dotOn");
    expect(dot(1)).not.toContain("dotOn");
    swipeTo(1);
    expect(dot(0)).not.toContain("dotOn");
    expect(dot(1)).toContain("dotOn");
    act(() => {
      mock.pager?.({
        nativeEvent: {
          contentOffset: { x: (2 + FIRST_PAGE_INDEX) * PAGE_STRIDE - 40 },
          layoutMeasurement: { width: VIEWPORT_WIDTH },
        },
      });
    });
    expect(dot(2)).toContain("dotOn");
    expect(dot(1)).not.toContain("dotOn");
  });

  it("starts from any page", () => {
    const onStart = vi.fn();
    render(
      <OpenerStep
        onStart={onStart}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("opener.getStarted"));
    swipeTo(1);
    fireEvent.click(screen.getByText("opener.getStarted"));
    swipeTo(2);
    fireEvent.click(screen.getByText("opener.getStarted"));
    expect(onStart).toHaveBeenCalledTimes(3);
  });

  it("offers sign-in on every page", () => {
    const onSignIn = vi.fn();
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={onSignIn}
        viewedPages={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("onboarding.signIn"));
    swipeTo(1);
    fireEvent.click(screen.getByText("onboarding.signIn"));
    swipeTo(2);
    fireEvent.click(screen.getByText("onboarding.signIn"));
    expect(onSignIn).toHaveBeenCalledTimes(3);
  });

  it("wraps a swipe in either direction and recenters on the matching preview", () => {
    renderOpener();
    act(() => mock.beginDrag?.());
    swipeTo(-1);
    expect(dot(3)).toContain("dotOn");
    expect(mock.scrollTo).toHaveBeenLastCalledWith({
      x: 5 * PAGE_STRIDE,
      animated: false,
    });
    swipeTo(4);
    expect(dot(0)).toContain("dotOn");
    expect(mock.scrollTo).toHaveBeenLastCalledWith({
      x: 2 * PAGE_STRIDE,
      animated: false,
    });
    expect(pageViews()).toEqual([0, 3]);
  });

  it("reports each page the first time it is shown", () => {
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    expect(pageViews()).toEqual([0]);
    swipeTo(1);
    swipeTo(2);
    swipeTo(1);
    swipeTo(0);
    swipeTo(2);
    expect(pageViews()).toEqual([0, 1, 2]);
    expect(mock.capture).toHaveBeenCalledWith("onboarding_opener_page_viewed", {
      page_index: 1,
    });
  });

  it("reports nothing again when the opener comes back in the same onboarding", () => {
    const viewedPages = new Set<number>();
    const first = render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={viewedPages}
      />,
    );
    swipeTo(1);
    first.unmount();
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={viewedPages}
      />,
    );
    swipeTo(1);
    swipeTo(2);
    expect(pageViews()).toEqual([0, 1, 2]);
  });

  it("keeps both actions available and pauses rotation at large text sizes", () => {
    vi.useFakeTimers();
    mock.largeText = true;
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    expect(screen.getByText("onboarding.haveAccount")).toBeTruthy();
    expect(screen.getByText("opener.getStarted")).toBeTruthy();
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });

  it("advances every three seconds and loops continuously", () => {
    vi.useFakeTimers();
    renderOpener();
    wait(2999);
    expect(dot(0)).toContain("dotOn");
    wait(1);
    expect(dot(1)).toContain("dotOn");
    wait(3000);
    expect(dot(2)).toContain("dotOn");
    wait(3000);
    expect(dot(3)).toContain("dotOn");
    wait(3000);
    expect(dot(0)).toContain("dotOn");
    wait(3000);
    expect(dot(1)).toContain("dotOn");
    expect(pageViews()).toEqual([0, 1, 2, 3]);
  });

  it("stops advancing for good once the person swipes", () => {
    vi.useFakeTimers();
    renderOpener();
    act(() => mock.beginDrag?.());
    swipeTo(1);
    swipeTo(0);
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });

  it("never advances with Reduce Motion on", () => {
    vi.useFakeTimers();
    mock.reducedMotion = true;
    renderOpener();
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });

  it("pauses while a screen reader is enabled", async () => {
    vi.useFakeTimers();
    mock.screenReader = true;
    renderOpener();
    await act(async () => {});
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });

  it("stops advancing when Reduce Motion is turned on mid-way", () => {
    vi.useFakeTimers();
    renderOpener();
    wait(3000);
    expect(dot(1)).toContain("dotOn");
    act(() => mock.reduceMotionChanged?.(true));
    wait(20000);
    expect(dot(1)).toContain("dotOn");
  });

  it("never advances when Reduce Motion was turned on after the app started", async () => {
    vi.useFakeTimers();
    mock.reduceMotionAtMount = true;
    renderOpener();
    await act(async () => {});
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });

  it("keeps a Reduce Motion change that lands before the mount query answers", async () => {
    vi.useFakeTimers();
    let answer: (enabled: boolean) => void = () => {};
    const query = new Promise<boolean>((resolve) => (answer = resolve));
    const { AccessibilityInfo } = await import("react-native");
    const spy = vi
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockReturnValue(query);
    renderOpener();
    act(() => mock.reduceMotionChanged?.(true));
    await act(async () => answer(false));
    wait(20000);
    expect(dot(0)).toContain("dotOn");
    spy.mockRestore();
  });

  it("stops advancing once the person scrolls a page's copy", () => {
    vi.useFakeTimers();
    renderOpener();
    act(() => mock.pageDrag?.());
    wait(20000);
    expect(dot(0)).toContain("dotOn");
  });
});
