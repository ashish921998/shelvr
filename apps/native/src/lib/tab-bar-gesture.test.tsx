// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withSpring } from "react-native-reanimated";
import { AppTabs } from "@/components/ui/app-tab-bar";

type Touch = {
  id: number;
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
};
type TouchEvent = { changedTouches: Touch[] };
type Manager = { activate: () => void; end: () => void; fail: () => void };
type Handler = (event: TouchEvent, argument?: Manager | boolean) => void;
type PillStyle = { width: number; transform: Record<string, number>[] };
const mock = vi.hoisted(() => ({
  reduced: false,
  focused: "(home)",
  presses: vi.fn(),
  handlers: {} as Record<string, Handler>,
  pill: undefined as undefined | (() => PillStyle),
  theme: {
    gap: (n: number) => n * 8,
    radius: { sm: 8, md: 11, lg: 16, xl: 24 },
    fonts: { regular: "r", medium: "m", bold: "b", display: "d" },
    colors: {
      background: "#faf6ee",
      surface: "#fffdf8",
      foreground: "#2b2418",
      muted: "#8d8271",
      primary: "#e6a23c",
      primarySoft: "#f7e8cd",
      border: "#ece3d1",
    },
  },
}));

function Element({
  children,
  testID,
  accessibilityState,
}: {
  children?: ReactNode;
  testID?: string;
  accessibilityState?: { selected: boolean };
}) {
  return (
    <div data-testid={testID} data-selected={accessibilityState?.selected}>
      {children}
    </div>
  );
}

vi.mock("react-native", () => ({
  View: Element,
  Text: Element,
  KeyboardAvoidingView: Element,
  TextInput: vi.fn(() => null),
  Pressable: vi.fn(
    ({ onPress, testID }: { onPress: () => void; testID: string }) => (
      <button data-testid={testID} onClick={onPress} />
    ),
  ),
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: "android" },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (sheet: (theme: typeof mock.theme) => unknown) => sheet(mock.theme),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ theme: mock.theme }),
}));
vi.mock("expo-router/ui", () => ({
  Tabs: Element,
  TabSlot: vi.fn(() => null),
  TabList: vi.fn(() => null),
  TabTrigger: vi.fn(() => null),
  useTabTrigger: ({ name }: { name: string }) => ({
    triggerProps: {
      isFocused: mock.focused === name,
      onPress: () => mock.presses(name),
    },
  }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: Element },
  useReducedMotion: () => mock.reduced,
  useSharedValue: (initial: unknown) => {
    const ref = useRef({
      value: initial,
      get() {
        return this.value;
      },
      set(value: unknown) {
        this.value = value;
      },
    });
    return ref.current;
  },
  useDerivedValue: (derive: () => unknown) => ({ get: derive }),
  useAnimatedStyle: (evaluate: () => unknown) => ({ evaluate }),
  withSpring: vi.fn((value: number) => value),
  withTiming: (value: number) => value,
  interpolate: (
    value: number,
    input: number[],
    output: number[],
    clamp?: string,
  ) => {
    const fraction = (value - input[0]) / (input[1] - input[0]);
    const progress = clamp ? Math.min(1, Math.max(0, fraction)) : fraction;
    return output[0] + progress * (output[1] - output[0]);
  },
}));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
    Manual: () => {
      const gesture: Record<string, unknown> = {};
      gesture.shouldCancelWhenOutside = () => gesture;
      for (const name of [
        "onTouchesDown",
        "onTouchesMove",
        "onTouchesUp",
        "onTouchesCancelled",
        "onFinalize",
      ]) {
        gesture[name] = (handler: Handler) => {
          mock.handlers[name] = handler;
          return gesture;
        };
      }
      return gesture;
    },
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  GestureDetector: ({
    children,
  }: {
    children: ReactElement<{ style: [unknown, { evaluate: () => PillStyle }] }>;
  }) => {
    mock.pill = children.props.style[1].evaluate;
    return children;
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    callback(...args),
  scheduleOnUI: (callback: () => void) => callback(),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 24 }),
}));
vi.mock("expo-haptics", () => ({
  AndroidHaptics: { Segment_Tick: 0, Virtual_Key: 1 },
  performAndroidHapticsAsync: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/use-keyboard-visible", () => ({
  useKeyboardVisible: () => false,
}));
vi.mock("@/lib/tab-search-query", () => ({
  useTabSearchQuery: () => "",
  setTabSearchQuery: vi.fn(),
}));

function point(x: number, y: number, id = 1): TouchEvent {
  return {
    changedTouches: [{ id, x, y, absoluteX: x + 100, absoluteY: y + 500 }],
  };
}

function down(x = 40, y = 29) {
  const manager = { activate: vi.fn(), end: vi.fn(), fail: vi.fn() };
  act(() => mock.handlers.onTouchesDown(point(x, y), manager));
  expect(manager.activate).toHaveBeenCalledOnce();
  return manager;
}

function move(x: number, y: number, id = 1) {
  const event = point(x, y, id);
  event.changedTouches[0].x = 999;
  event.changedTouches[0].y = 999;
  act(() => mock.handlers.onTouchesMove(event));
}

function release(success = true) {
  const manager = { activate: vi.fn(), end: vi.fn(), fail: vi.fn() };
  act(() => {
    mock.handlers.onTouchesUp(point(40, 29), manager);
    mock.handlers.onFinalize(point(40, 29), success);
  });
  expect(manager.end).toHaveBeenCalledOnce();
}

function pill() {
  if (!mock.pill) throw new Error("Real pill style was not rendered");
  return mock.pill();
}

function expectTransform(x: number, y: number, pressed: boolean) {
  const style = pill();
  expect(style.width).toBe(300);
  const transforms = Object.assign({}, ...style.transform);
  const stretchX = (Math.sign(x) * 56 * Math.abs(x)) / (Math.abs(x) + 56);
  const stretchY = (Math.sign(y) * 56 * Math.abs(y)) / (Math.abs(y) + 56);
  const growX = (Math.abs(stretchX) / 56) * 0.1;
  const growY = (Math.abs(stretchY) / 56) * 0.1;
  const press = pressed ? 1.03 : 1;
  expect(transforms.translateX ?? 0).toBeCloseTo(
    mock.reduced ? 0 : stretchX * 0.3,
  );
  expect(transforms.translateY ?? 0).toBeCloseTo(
    mock.reduced ? 0 : stretchY * 0.3,
  );
  expect(transforms.scaleX ?? 1).toBeCloseTo(
    mock.reduced ? 1 : press * (1 + growX - growY * 0.5),
  );
  expect(transforms.scaleY ?? 1).toBeCloseTo(
    mock.reduced ? 1 : press * (1 + growY - growX * 0.5),
  );
}

describe.each([false, true])(
  "real fallback pill, reduced motion %s",
  (reduced) => {
    beforeEach(() => {
      vi.clearAllMocks();
      mock.reduced = reduced;
      mock.focused = "(home)";
      mock.handlers = {};
      mock.pill = undefined;
    });

    it("keeps width while suppressing only reduced-mode press and four-edge deformation", () => {
      render(<AppTabs />);
      expectTransform(0, 0, false);
      down();
      expectTransform(0, 0, true);
      for (const [x, y, overflowX, overflowY] of [
        [-56, 29, -56, 0],
        [356, 29, 56, 0],
        [150, -56, 0, -56],
        [150, 114, 0, 56],
        [-112, -56, -112, -56],
        [412, 170, 112, 112],
        [150, 29, 0, 0],
      ]) {
        move(x, y);
        expectTransform(overflowX, overflowY, true);
      }
      release();
      expectTransform(0, 0, false);
      expect(withSpring).toHaveBeenCalledWith(1, {
        damping: 20,
        stiffness: 320,
        mass: 0.7,
      });
      expect(withSpring).toHaveBeenCalledWith(0, {
        damping: 18,
        stiffness: 260,
        mass: 0.6,
      });
    });

    it("scrubs through reversals without selecting until a valid release", () => {
      const view = render(<AppTabs />);
      down();
      move(260, 29);
      move(110, 29);
      move(190, 29);
      move(40, 29, 2);
      expect(mock.presses).not.toHaveBeenCalled();
      release();
      expect(mock.presses.mock.calls).toEqual([["(tidy)"]]);
      mock.focused = "(tidy)";
      view.rerender(<AppTabs />);
      expect(screen.getByTestId("tab-tidy").getAttribute("data-selected")).toBe(
        "true",
      );
      expect(pill().width).toBe(300);
    });

    it.each([
      [-1, 29],
      [301, 29],
      [150, -29],
      [150, 87],
    ])("cancels release outside the row at %s,%s", (x, y) => {
      render(<AppTabs />);
      down();
      move(x, y);
      release();
      expect(mock.presses).not.toHaveBeenCalled();
      expectTransform(0, 0, false);
    });

    it.each([-28, 86])("accepts the vertical slop boundary %s", (y) => {
      render(<AppTabs />);
      down();
      move(110, y);
      release();
      expect(mock.presses.mock.calls).toEqual([["(spaces)"]]);
    });

    it("fails native cancellation without selecting", () => {
      render(<AppTabs />);
      const manager = down();
      move(260, 29);
      act(() => {
        mock.handlers.onTouchesCancelled(point(260, 29), manager);
        mock.handlers.onFinalize(point(260, 29), false);
      });
      expect(manager.fail).toHaveBeenCalledOnce();
      expect(mock.presses).not.toHaveBeenCalled();
      expectTransform(0, 0, false);
    });

    it("morphs width for Search and restores the previously focused tab on valid back release", () => {
      mock.focused = "(spaces)";
      const view = render(<AppTabs />);
      fireEvent.click(screen.getByTestId("tab-search"));
      expect(mock.presses.mock.calls).toEqual([["(search)"]]);
      mock.focused = "(search)";
      view.rerender(<AppTabs />);
      expect(pill().width).toBe(58);
      expect(withSpring).toHaveBeenCalledWith(1, {
        damping: 24,
        stiffness: 210,
        mass: 1,
      });
      down(29, 29);
      move(59, 29);
      release();
      expect(mock.presses).toHaveBeenCalledOnce();
      down(29, 29);
      release();
      expect(mock.presses.mock.calls).toEqual([["(search)"], ["(spaces)"]]);
      mock.focused = "(spaces)";
      view.rerender(<AppTabs />);
      expect(pill().width).toBe(300);
      expect(
        screen.getByTestId("tab-spaces").getAttribute("data-selected"),
      ).toBe("true");
    });
  },
);
