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

const PAGE_WIDTH = 390;

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
    pager: null as null | ((event: ScrollEvent) => void),
    beginDrag: null as null | (() => void),
    view: ({
      children,
      testID,
      style,
    }: Children & { testID?: string; style?: unknown }) => (
      <div data-testid={testID} data-style={styleNames(style)}>
        {children}
      </div>
    ),
    text: ({ children }: Children) => <span>{children}</span>,
    pressable: ({ children, onPress }: Children & { onPress?: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
    button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {label}
      </button>
    ),
    phone: ({ children, overlay }: Children & { overlay?: ReactNode }) => (
      <div>
        {children}
        {overlay}
      </div>
    ),
    shareScene: ({ shown }: { shown: boolean }) => (
      <div>{shown ? "share-scene-shown" : "share-scene-waiting"}</div>
    ),
    fileScene: () => <div>file-scene</div>,
    planScene: () => <div>plan-scene</div>,
    filedToast: () => <div>filed-toast</div>,
  };
});

vi.mock("react-native", async () => {
  const { useEffect, useImperativeHandle, useRef } = await import("react");
  const ScrollView = ({
    ref,
    children,
    horizontal,
    onLayout,
    onScroll,
    onScrollBeginDrag,
  }: Children & {
    ref?: React.Ref<{ scrollTo: (to: { x: number }) => void }>;
    horizontal?: boolean;
    onLayout?: (event: unknown) => void;
    onScroll?: (event: ScrollEvent) => void;
    onScrollBeginDrag?: () => void;
  }) => {
    if (horizontal && onScroll) mock.pager = onScroll;
    if (horizontal && onScrollBeginDrag) mock.beginDrag = onScrollBeginDrag;
    useImperativeHandle(ref, () => ({
      scrollTo: ({ x }: { x: number }) =>
        onScroll?.({
          nativeEvent: {
            contentOffset: { x },
            layoutMeasurement: { width: PAGE_WIDTH },
          },
        }),
    }));
    const laidOut = useRef(false);
    useEffect(() => {
      if (!horizontal || laidOut.current) return;
      laidOut.current = true;
      onLayout?.({
        nativeEvent: {
          layout: { x: 0, y: 0, width: PAGE_WIDTH, height: 600 },
        },
      });
    }, [horizontal, onLayout]);
    return <div>{children}</div>;
  };
  return {
    View: mock.view,
    Text: mock.text,
    Pressable: mock.pressable,
    ScrollView,
  };
});
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () =>
      new Proxy({}, { get: (_target, key) => ({ __name: String(key) }) }),
  },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: mock.view },
  useReducedMotion: () => mock.reducedMotion,
}));
vi.mock("@/lib/motion", () => ({
  fadeIn: {},
  fadeOut: {},
  motion: { duration: { state: 180 } },
  motionCSS: { out: {} },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({
  HEADLINE_MAX_SCALE: 2,
  useLargeText: () => mock.largeText,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture },
}));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));
vi.mock("@/components/onboarding/opener-phone", () => ({
  PhoneFrame: mock.phone,
}));
vi.mock("@/components/onboarding/opener-scenes", () => ({
  ShareScene: mock.shareScene,
  FileScene: mock.fileScene,
  PlanScene: mock.planScene,
  FiledToast: mock.filedToast,
}));

const { OpenerStep } = await import("@/components/onboarding/opener");

const swipeTo = (index: number) =>
  act(() => {
    mock.pager?.({
      nativeEvent: {
        contentOffset: { x: index * PAGE_WIDTH },
        layoutMeasurement: { width: PAGE_WIDTH },
      },
    });
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
  mock.pager = null;
  mock.beginDrag = null;
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
  it("shows the three pages, each with its headline and body", () => {
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    for (const page of ["Save", "File", "Plan"]) {
      expect(screen.getByText(`onboarding.opener${page}Title`)).toBeTruthy();
      expect(screen.getByText(`onboarding.opener${page}Accent`)).toBeTruthy();
      expect(screen.getByText(`onboarding.opener${page}Body`)).toBeTruthy();
    }
    expect(screen.getByText("file-scene")).toBeTruthy();
    expect(screen.getByText("plan-scene")).toBeTruthy();
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
          contentOffset: { x: 2 * PAGE_WIDTH - 40 },
          layoutMeasurement: { width: PAGE_WIDTH },
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
    fireEvent.click(screen.getByText("onboarding.startYours"));
    swipeTo(1);
    fireEvent.click(screen.getByText("onboarding.startYours"));
    swipeTo(2);
    fireEvent.click(screen.getByText("onboarding.startYours"));
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

  it("plays a page's entrance once the page is reached, and keeps it", () => {
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    expect(screen.getByText("share-scene-shown")).toBeTruthy();
    expect(screen.queryByText("filed-toast")).toBeNull();
    swipeTo(1);
    expect(screen.getByText("filed-toast")).toBeTruthy();
    swipeTo(0);
    expect(screen.getByText("filed-toast")).toBeTruthy();
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

  it("keeps sign-in with each page's copy at the large text sizes", () => {
    mock.largeText = true;
    render(
      <OpenerStep
        onStart={vi.fn()}
        onSignIn={vi.fn()}
        viewedPages={new Set()}
      />,
    );
    expect(screen.getAllByText("onboarding.haveAccount")).toHaveLength(3);
    expect(screen.getByText("onboarding.startYours")).toBeTruthy();
  });

  it("advances a page every four seconds and stops on the last", () => {
    vi.useFakeTimers();
    renderOpener();
    wait(3999);
    expect(dot(0)).toContain("dotOn");
    wait(1);
    expect(dot(1)).toContain("dotOn");
    wait(4000);
    expect(dot(2)).toContain("dotOn");
    wait(20000);
    expect(dot(2)).toContain("dotOn");
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
});
