// @vitest-environment jsdom
// The opener's three pages: their copy, the dots that follow a swipe, "Start
// yours" under every page, sign-in on the first page only, and one analytics
// event per page.
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
  // The mocked StyleSheet names each style, and the mocked View lists the
  // names it was given, so a test can see which dot is lit.
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
    pager: null as null | ((event: ScrollEvent) => void),
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
  const { useEffect } = await import("react");
  // The pager reports its size once, like a laid-out ScrollView, and hands
  // its scroll handler to the test so a swipe can be played.
  const ScrollView = ({
    children,
    horizontal,
    onLayout,
    onScroll,
  }: Children & {
    horizontal?: boolean;
    onLayout?: (event: unknown) => void;
    onScroll?: (event: ScrollEvent) => void;
  }) => {
    if (horizontal && onScroll) mock.pager = onScroll;
    useEffect(() => {
      if (horizontal)
        onLayout?.({
          nativeEvent: { layout: { x: 0, y: 0, width: PAGE_WIDTH, height: 600 } },
        });
      // Once, as a layout pass would.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
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
  mock.pager = null;
});

describe("OpenerStep", () => {
  it("shows the three pages, each with its headline and body", () => {
    render(<OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} />);
    for (const page of ["Save", "File", "Plan"]) {
      expect(screen.getByText(`onboarding.opener${page}Title`)).toBeTruthy();
      expect(screen.getByText(`onboarding.opener${page}Accent`)).toBeTruthy();
      expect(screen.getByText(`onboarding.opener${page}Body`)).toBeTruthy();
    }
    expect(screen.getByText("file-scene")).toBeTruthy();
    expect(screen.getByText("plan-scene")).toBeTruthy();
  });

  it("lights the dot of the page in view", () => {
    render(<OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} />);
    expect(dot(0)).toContain("dotOn");
    expect(dot(1)).not.toContain("dotOn");
    swipeTo(1);
    expect(dot(0)).not.toContain("dotOn");
    expect(dot(1)).toContain("dotOn");
    // A swipe that settles a little short of the page still counts as it.
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
    render(<OpenerStep onStart={onStart} onSignIn={vi.fn()} />);
    fireEvent.click(screen.getByText("onboarding.startYours"));
    swipeTo(1);
    fireEvent.click(screen.getByText("onboarding.startYours"));
    swipeTo(2);
    fireEvent.click(screen.getByText("onboarding.startYours"));
    expect(onStart).toHaveBeenCalledTimes(3);
  });

  it("offers sign-in on the first page only", () => {
    const onSignIn = vi.fn();
    render(<OpenerStep onStart={vi.fn()} onSignIn={onSignIn} />);
    expect(screen.getByText("onboarding.haveAccount")).toBeTruthy();
    swipeTo(1);
    expect(screen.queryByText("onboarding.haveAccount")).toBeNull();
    swipeTo(2);
    expect(screen.queryByText("onboarding.haveAccount")).toBeNull();
    swipeTo(0);
    fireEvent.click(screen.getByText("onboarding.signIn"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("plays a page's entrance once the page is reached, and keeps it", () => {
    render(<OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getByText("share-scene-shown")).toBeTruthy();
    expect(screen.queryByText("filed-toast")).toBeNull();
    swipeTo(1);
    expect(screen.getByText("filed-toast")).toBeTruthy();
    swipeTo(0);
    expect(screen.getByText("filed-toast")).toBeTruthy();
  });

  it("reports each page the first time it is shown", () => {
    render(<OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} />);
    expect(pageViews()).toEqual([0]);
    swipeTo(1);
    swipeTo(2);
    swipeTo(1);
    swipeTo(0);
    swipeTo(2);
    expect(pageViews()).toEqual([0, 1, 2]);
    expect(mock.capture).toHaveBeenCalledWith(
      "onboarding_opener_page_viewed",
      { page_index: 1 },
    );
  });

  it("keeps sign-in with the first page's copy at the large text sizes", () => {
    mock.largeText = true;
    render(<OpenerStep onStart={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getAllByText("onboarding.haveAccount")).toHaveLength(1);
    swipeTo(2);
    // It belongs to the first page, which is still mounted, not to the
    // footer under every page.
    expect(screen.getAllByText("onboarding.haveAccount")).toHaveLength(1);
    expect(screen.getByText("onboarding.startYours")).toBeTruthy();
  });
});
