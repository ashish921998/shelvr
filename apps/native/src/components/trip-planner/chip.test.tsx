// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { Chip } from "./chip";

const selection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/haptics", () => ({ haptics: { selection } }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityRole,
    }: {
      children?: ReactNode;
      onPress: () => void;
      accessibilityRole: string;
    }) => (
      <button role={accessibilityRole} onClick={onPress}>
        {children}
      </button>
    ),
  ),
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));

beforeEach(() => vi.clearAllMocks());

it.each([
  ["radio", true, false],
  ["radio", false, true],
  ["checkbox", true, true],
  ["checkbox", false, true],
] as const)(
  "preserves %s presses when selected=%s, with feedback=%s",
  (pick, selected, feedback) => {
    const onPress = vi.fn();
    render(
      <Chip
        label="Day 2"
        pick={pick}
        selected={selected}
        fill={{ background: "black", foreground: "white" }}
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByRole(pick));
    expect(onPress).toHaveBeenCalledOnce();
    expect(selection).toHaveBeenCalledTimes(feedback ? 1 : 0);
  },
);
