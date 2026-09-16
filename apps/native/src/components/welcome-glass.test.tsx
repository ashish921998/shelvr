// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WelcomeGlass } from "./welcome-glass";

const motion = vi.hoisted(() => ({
  reduced: false,
  active: vi.fn(),
  timing: vi.fn(() => 1),
  remove: vi.fn(),
  image: {} as object | null,
  onAppState: (_state: string) => {},
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, listener: (state: string) => void) => {
      motion.onAppState = listener;
      return { remove: motion.remove };
    },
  },
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    rt: { themeName: "light" },
    theme: {
      colors: {
        background: "#faf6ee",
        foreground: "#2b2418",
        primary: "#e6a23c",
      },
    },
  }),
}));
vi.mock("@shopify/react-native-skia", () => ({
  Canvas: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Fill: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Shader: vi.fn(() => null),
  ImageShader: vi.fn(() => null),
  useImage: vi.fn(() => motion.image),
  Skia: {
    RuntimeEffect: { Make: vi.fn(() => ({})) },
    Color: vi.fn(() => [1, 1, 1, 1]),
  },
}));
vi.mock("react-native-gesture-handler", () => {
  const pan = {
    enabled: vi.fn(() => pan),
    activeOffsetX: vi.fn(() => pan),
    failOffsetY: vi.fn(() => pan),
    onChange: vi.fn(() => pan),
    onFinalize: vi.fn(() => pan),
  };
  return {
    Gesture: { Pan: vi.fn(() => pan) },
    GestureDetector: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  };
});
vi.mock("react-native-reanimated", async () => {
  const { useMemo } = await import("react");
  return {
    cancelAnimation: vi.fn(),
    Easing: { linear: vi.fn() },
    useReducedMotion: () => motion.reduced,
    useFrameCallback: () => ({ setActive: motion.active }),
    useDerivedValue: (read: () => unknown) => read(),
    useSharedValue: (initial: number) =>
      useMemo(() => {
        let value = initial;
        return {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      }, [initial]),
    withTiming: motion.timing,
    withSpring: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  motion.reduced = false;
  motion.image = {};
});

it("animates automatically, pauses in the background, and stops after leaving", () => {
  const { unmount } = render(<WelcomeGlass width={330} />);
  expect(motion.active).toHaveBeenLastCalledWith(true);
  expect(motion.timing).toHaveBeenCalled();
  act(() => motion.onAppState("background"));
  expect(motion.active).toHaveBeenLastCalledWith(false);
  act(() => motion.onAppState("active"));
  expect(motion.active).toHaveBeenLastCalledWith(true);
  unmount();
  expect(motion.active).toHaveBeenLastCalledWith(false);
  expect(motion.remove).toHaveBeenCalledOnce();
});

it("keeps reduced-motion artwork still, including after returning to the app", () => {
  motion.reduced = true;
  render(<WelcomeGlass width={330} />);
  expect(motion.timing).not.toHaveBeenCalled();
  expect(motion.active).toHaveBeenLastCalledWith(false);
  act(() => motion.onAppState("active"));
  expect(motion.active).toHaveBeenLastCalledWith(false);
});

it("does not spend frames animating before the saved images are loaded", () => {
  motion.image = null;
  render(<WelcomeGlass width={330} />);
  expect(motion.active).toHaveBeenLastCalledWith(false);
  act(() => motion.onAppState("active"));
  expect(motion.active).toHaveBeenLastCalledWith(false);
});
