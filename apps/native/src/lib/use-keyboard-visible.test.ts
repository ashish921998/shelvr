// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardVisible } from "./use-keyboard-visible";

const keyboard = vi.hoisted(() => ({
  currentlyShowing: false,
  listeners: new Map<string, () => void>(),
  // React Native's singleton method reads its receiver, so an unbound
  // state initializer must fail here just as it does on Android.
  isVisible(): boolean {
    return this.currentlyShowing;
  },
  addListener(event: string, listener: () => void) {
    this.listeners.set(event, listener);
    return { remove: () => this.listeners.delete(event) };
  },
}));

vi.mock("react-native", () => ({ Keyboard: keyboard }));

beforeEach(() => {
  keyboard.currentlyShowing = false;
  keyboard.listeners.clear();
});

describe("useKeyboardVisible", () => {
  it.each([false, true])("mounts with keyboard visibility %s", (visible) => {
    keyboard.currentlyShowing = visible;
    const { result } = renderHook(useKeyboardVisible);
    expect(result.current).toBe(visible);
  });

  it("tracks opening and dismissing the keyboard", () => {
    const { result } = renderHook(useKeyboardVisible);
    act(() => keyboard.listeners.get("keyboardDidShow")?.());
    expect(result.current).toBe(true);
    act(() => keyboard.listeners.get("keyboardDidHide")?.());
    expect(result.current).toBe(false);
  });

  it("removes both subscriptions when the tabs unmount", () => {
    const { unmount } = renderHook(useKeyboardVisible);
    expect(keyboard.listeners.size).toBe(2);
    unmount();
    expect(keyboard.listeners.size).toBe(0);
  });
});
