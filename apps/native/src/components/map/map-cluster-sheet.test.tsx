// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { MapClusterSheet } from "./map-cluster-sheet";

const mock = vi.hoisted(() => ({
  sheet: {} as { onDismiss?: () => void; onClose?: () => void },
  platform: { OS: "ios" },
}));

vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    (props: {
      children: ReactNode;
      visible: boolean;
      title: string;
      onDismiss: () => void;
      onClose: () => void;
    }) => {
      mock.sheet = props;
      return props.visible ? (
        <section>
          <h1>{props.title}</h1>
          {props.children}
        </section>
      ) : null;
    },
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native", () => ({
  Platform: mock.platform,
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));

const pins = [
  { id: "a", name: "Eberly", lat: 30.26, lng: -97.74, emoji: "🍽️" },
  { id: "b", name: "Guest House", lat: 30.26, lng: -97.74 },
];

beforeEach(() => {
  mock.platform.OS = "ios";
});

it("dismisses the iOS picker before opening a place, and opens it only once", () => {
  const close = vi.fn();
  const select = vi.fn();
  const { rerender } = render(
    <MapClusterSheet pins={pins} onClose={close} onSelect={select} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Eberly" }));
  expect(close).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
  rerender(<MapClusterSheet pins={[]} onClose={close} onSelect={select} />);
  act(() => mock.sheet.onDismiss?.());
  act(() => mock.sheet.onDismiss?.());
  expect(select).toHaveBeenCalledExactlyOnceWith("a");
});

it("opens the chosen place on Android without waiting for an iOS dismiss callback", () => {
  mock.platform.OS = "android";
  const select = vi.fn();
  render(<MapClusterSheet pins={pins} onClose={vi.fn()} onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: "Guest House" }));
  expect(select).toHaveBeenCalledExactlyOnceWith("b");
});

it("does not open a place when the picker is cancelled", () => {
  const select = vi.fn();
  const close = vi.fn();
  render(<MapClusterSheet pins={pins} onClose={close} onSelect={select} />);
  act(() => mock.sheet.onClose?.());
  act(() => mock.sheet.onDismiss?.());
  expect(close).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
});
