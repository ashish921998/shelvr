// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PillButton } from "./parts";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  pressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
    disabled,
    onPress,
  }: Children & {
    accessibilityLabel?: string;
    accessibilityState?: { busy?: boolean };
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-busy={accessibilityState?.busy ? "true" : "false"}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  text: ({ children }: Children) => <span>{children}</span>,
  view: ({ children }: Children) => <div>{children}</div>,
  stitches: () => <div role="progressbar" />,
  none: () => null,
}));

vi.mock("react-native", () => ({
  Pressable: mock.pressable,
  Text: mock.text,
  View: mock.view,
}));
vi.mock("react-native-reanimated", () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => false,
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme: { colors: { background: "white" } } }),
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/components/ui/stitch-loader", () => ({ StitchRow: mock.stitches }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.none }));
vi.mock("@/lib/motion", () => ({ motion: {} }));
vi.mock("@/lib/haptics", () => ({ haptics: {} }));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 2 }));

afterEach(cleanup);

it("keeps its label as its name while the stitches replace the text", () => {
  render(<PillButton label="Continue" busy onPress={vi.fn()} />);

  const pill = screen.getByRole("button", { name: "Continue" });
  expect(pill.getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByText("Continue")).toBeNull();
});

it("ignores a press while busy", () => {
  const onPress = vi.fn();
  render(<PillButton label="Continue" busy onPress={onPress} />);

  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onPress).not.toHaveBeenCalled();
});
