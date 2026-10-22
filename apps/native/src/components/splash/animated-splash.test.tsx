// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SPLASH_DURATION, SPLASH_EXIT_FROM } from "./timeline";

const motion = vi.hoisted(() => ({
  completions: [] as ((completed: boolean) => void)[],
}));

type Props = {
  children?: ReactNode;
  pointerEvents?: string;
  testID?: string;
};

vi.mock("react-native", () => ({
  Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  View: vi.fn(({ children }: Props) => <div>{children}</div>),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children, pointerEvents }: Props) => (
      <div data-testid="animated" data-pointer-events={pointerEvents}>
        {children}
      </div>
    )),
    Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  },
  cancelAnimation: vi.fn(),
  Easing: { linear: (t: number) => t },
  ReduceMotion: { Never: "never" },
  useAnimatedStyle: (worklet: () => unknown) => worklet(),
  useReducedMotion: () => false,
  useSharedValue: (value: number) => ({
    get: () => value,
    set: () => {},
  }),
  withTiming: (
    to: number,
    _config: unknown,
    done?: (completed: boolean) => void,
  ) => {
    if (done) motion.completions.push(done);
    return to;
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: () => void) => fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ rt: { themeName: "light" } }),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("./thread-canvas", () => ({ ThreadCanvas: vi.fn(() => null) }));
vi.mock("./splash-mark", () => ({ SplashMark: vi.fn(() => null) }));

beforeEach(() => {
  vi.useFakeTimers();
  motion.completions = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const screen = (container: HTMLElement) =>
  container.querySelector('[data-testid="animated"]');

it("leaves on its own when the clock's completion never lands", async () => {
  const { AnimatedSplash } = await import("./animated-splash");
  const onFinish = vi.fn();
  render(<AnimatedSplash onFinish={onFinish} />);

  act(() => vi.advanceTimersByTime(SPLASH_DURATION * 1000));
  expect(onFinish).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(1000));
  expect(onFinish).toHaveBeenCalledTimes(1);
});

it("finishes once when the completion lands before the fallback", async () => {
  const { AnimatedSplash } = await import("./animated-splash");
  const onFinish = vi.fn();
  render(<AnimatedSplash onFinish={onFinish} />);

  act(() => vi.advanceTimersByTime(SPLASH_DURATION * 1000));
  act(() => motion.completions.at(-1)?.(true));
  expect(onFinish).toHaveBeenCalledTimes(1);

  act(() => vi.advanceTimersByTime(1000));
  expect(onFinish).toHaveBeenCalledTimes(1);
});

it("lets touches through to the app once the cross-fade starts", async () => {
  const { AnimatedSplash } = await import("./animated-splash");
  const { container } = render(<AnimatedSplash onFinish={() => {}} />);

  expect(screen(container)?.getAttribute("data-pointer-events")).toBe("auto");

  act(() => vi.advanceTimersByTime(SPLASH_EXIT_FROM * 1000));
  expect(screen(container)?.getAttribute("data-pointer-events")).toBe("none");
});
