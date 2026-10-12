// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({
  reduced: false,
  withRepeat: vi.fn((animation: unknown, _repeats?: number) => animation),
  cancelAnimation: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div data-testid="stitch">{children}</div>
  )),
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
  useUnistyles: () => ({ theme: { colors: { primary: "amber" } } }),
}));

beforeEach(() => {
  motion.reduced = false;
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
