// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { LayoutChangeEvent } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSheetInsets } from "./use-sheet-insets";

const screen = vi.hoisted(() => ({
  width: 466,
  insets: { top: 0, bottom: 34, left: 0, right: 84 },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: screen.width, height: 678 }),
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ rt: { insets: screen.insets } }),
}));

const layout = (width: number) =>
  ({
    nativeEvent: { layout: { x: 0, y: 0, width, height: 400 } },
  }) as LayoutChangeEvent;

beforeEach(() => {
  screen.width = 466;
  screen.insets = { top: 0, bottom: 34, left: 0, right: 84 };
});

describe("useSheetInsets", () => {
  it("keeps a full-width sheet on the Duo's outer screen clear of the strip", () => {
    const { result } = renderHook(() => useSheetInsets());
    expect(result.current.insets).toEqual({ left: 0, right: 84 });
    act(() => result.current.onLayout(layout(466)));
    expect(result.current.insets).toEqual({ left: 0, right: 84 });
  });

  it("drops the inset once the sheet measures as a centered card", () => {
    screen.width = 951;
    const { result } = renderHook(() => useSheetInsets());
    act(() => result.current.onLayout(layout(540)));
    expect(result.current.insets).toEqual({ left: 0, right: 0 });
  });

  it("adds nothing when the window has no side insets", () => {
    screen.width = 402;
    screen.insets = { top: 62, bottom: 34, left: 0, right: 0 };
    const { result } = renderHook(() => useSheetInsets());
    act(() => result.current.onLayout(layout(402)));
    expect(result.current.insets).toEqual({ left: 0, right: 0 });
  });
});
