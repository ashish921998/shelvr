// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({
  reduced: false,
  themeName: "dark",
  withRepeat: vi.fn((animation: unknown, _repeats?: number) => animation),
  cancelAnimation: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: vi.fn(
    ({
      children,
      style,
    }: {
      children?: ReactNode;
      style?: { backgroundColor?: string };
    }) => (
      <div data-testid="stitch" data-color={style?.backgroundColor}>
        {children}
      </div>
    ),
  ),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children?: ReactNode }) => (
      <div data-testid="loader">{children}</div>
    )),
  },
  Easing: { linear: (t: number) => t },
  interpolate: () => 1,
  ReduceMotion: { Never: "never" },
  useAnimatedStyle: (worklet: () => unknown) => worklet(),
  useReducedMotion: () => motion.reduced,
  useSharedValue: (value: number) => ({ value }),
  withRepeat: motion.withRepeat,
  withTiming: (to: number) => to,
  cancelAnimation: motion.cancelAnimation,
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    theme: { colors: { primary: "amber", primaryText: "deep-amber" } },
    rt: { themeName: motion.themeName },
  }),
}));

beforeEach(() => {
  motion.reduced = false;
  motion.themeName = "dark";
  motion.withRepeat.mockClear();
  motion.cancelAnimation.mockClear();
});

it("sews a ring of eight stitches and stops the loop when it leaves", async () => {
  const { StitchRing } = await import("./stitch-loader");
  const { getAllByTestId, unmount } = render(<StitchRing />);
  expect(getAllByTestId("stitch")).toHaveLength(8);
  expect(motion.withRepeat.mock.calls[0]?.[1]).toBe(-1);
  unmount();
  expect(motion.cancelAnimation).toHaveBeenCalledTimes(1);
});

it("sews three stitches in a row for a busy button", async () => {
  const { StitchRow } = await import("./stitch-loader");
  const { getAllByTestId } = render(<StitchRow />);
  expect(getAllByTestId("loader")).toHaveLength(3);
});

it("holds a still frame instead of looping under Reduce Motion", async () => {
  motion.reduced = true;
  const { StitchRing, StitchRow } = await import("./stitch-loader");
  render(
    <>
      <StitchRing />
      <StitchRow />
    </>,
  );
  expect(motion.withRepeat).not.toHaveBeenCalled();
});

it("sews in the deeper amber on light paper and the brand amber on dark", async () => {
  const { StitchRing } = await import("./stitch-loader");
  const dark = render(<StitchRing />);
  expect(dark.getAllByTestId("stitch")[0]?.dataset.color).toBe("amber");
  dark.unmount();
  motion.themeName = "light";
  const light = render(<StitchRing />);
  expect(light.getAllByTestId("stitch")[0]?.dataset.color).toBe("deep-amber");
  light.unmount();
  const custom = render(<StitchRing color="white" />);
  expect(custom.getAllByTestId("stitch")[0]?.dataset.color).toBe("white");
});
