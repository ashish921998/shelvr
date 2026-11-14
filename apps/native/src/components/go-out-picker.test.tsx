// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { GoOutPicker } from "@/components/go-out-picker";

const mocks = vi.hoisted(() => ({ openURL: vi.fn() }));

vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: vi.fn(), impact: vi.fn() },
}));
vi.mock("@/lib/date-plan", () => ({
  directionsUrl: (place: { name: string }) => `maps:${place.name}`,
}));
vi.mock("@/lib/motion", () => ({ motion: { timing: { feedback: {} } } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/go-out-art", () => ({ GoOutDice: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      disabled,
      onPress,
    }: {
      title: string;
      disabled?: boolean;
      onPress: () => void;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  useSharedValue: () => ({ get: () => 0, set: vi.fn() }),
  withSequence: vi.fn(),
  withTiming: vi.fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { foreground: "#000" } } }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: vi.fn(() => <span>loading</span>),
  Linking: { openURL: mocks.openURL },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const places = [
  { name: "Franklin Barbecue", lat: 30.27, lng: -97.73, kinds: ["food"] },
  { name: "Small Victory", lat: 30.26, lng: -97.74, kinds: ["drinks"] },
];

const picker = (props: Partial<Parameters<typeof GoOutPicker>[0]> = {}) => (
  <GoOutPicker
    places={places}
    city="Austin"
    loading={false}
    failed={false}
    onRetry={vi.fn()}
    onClose={vi.fn()}
    onBack={vi.fn()}
    {...props}
  />
);
const roll = () => screen.getByRole("button", { name: /^goOut\.roll/ });

beforeEach(() => {
  mocks.openURL.mockResolvedValue(undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

it("rolls a place from the chosen category", () => {
  render(picker());
  fireEvent.click(screen.getByRole("button", { name: /map\.kindDrinks, 1/ }));
  fireEvent.click(roll());
  expect(screen.getByText("goOut.yourPick")).toBeTruthy();
  expect(screen.getByText("Small Victory")).toBeTruthy();
  expect(screen.queryByText("Franklin Barbecue")).toBeNull();
  expect(roll().textContent).toBe("goOut.rollAgain");
});

it("rolls a different place the second time", () => {
  render(picker());
  fireEvent.click(roll());
  expect(screen.getByText("Franklin Barbecue")).toBeTruthy();
  fireEvent.click(roll());
  expect(screen.getByText("Small Victory")).toBeTruthy();
});

it("disables a category with no places and the roll when nothing matches", () => {
  render(picker({ places: [] }));
  expect(
    (screen.getByRole("button", { name: "goOut.any, 0" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect((roll() as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("plan.emptyTitle")).toBeTruthy();
});

it("offers a retry when the places failed to load", () => {
  const onRetry = vi.fn();
  render(picker({ failed: true, onRetry }));
  fireEvent.click(screen.getByRole("button", { name: "errors.tryAgain" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect((roll() as HTMLButtonElement).disabled).toBe(true);
});

it("goes back and closes", () => {
  const onBack = vi.fn();
  const onClose = vi.fn();
  render(picker({ onBack, onClose }));
  fireEvent.click(screen.getByRole("button", { name: "common.back" }));
  fireEvent.click(screen.getByRole("button", { name: "common.close" }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
