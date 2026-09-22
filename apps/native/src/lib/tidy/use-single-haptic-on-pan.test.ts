// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as Haptics from "expo-haptics";
import { useSingleHapticOnPan } from "./use-single-haptic-on-pan";

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
vi.mock("react-native-reanimated", async () => {
  const { useRef } = await import("react");
  return {
    useSharedValue: (initial: boolean) =>
      useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(value: boolean) {
          this.value = value;
        },
      }).current,
  };
});
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: () => void) => fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("fires once per pan, stays latched after retreat, and rearms on grab", () => {
  vi.stubEnv("EXPO_OS", "ios");
  const { result, rerender } = renderHook(() =>
    useSingleHapticOnPan({ thresholdX: 100, thresholdY: 160 }),
  );
  result.current.singleHapticOnChange(120, 0);
  result.current.singleHapticOnChange(0, 0);
  rerender();
  result.current.singleHapticOnChange(0, -200);
  result.current.commitHaptic();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  result.current.resetHaptic();
  result.current.singleHapticOnChange(20, 0);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  result.current.commitHaptic();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
});

it("does not fire for a downward-dominant drag past the side threshold", () => {
  vi.stubEnv("EXPO_OS", "ios");
  const { result } = renderHook(() =>
    useSingleHapticOnPan({ thresholdX: 100, thresholdY: 160 }),
  );
  // 150px right clears thresholdX alone, but 400px down dominates: the
  // release would refuse, so the drag must not promise a commit either.
  result.current.singleHapticOnChange(150, 400);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  // The dominant upward drag still fires once.
  result.current.singleHapticOnChange(0, -200);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
});

it("does not fire at exactly the commit threshold, only past it", () => {
  vi.stubEnv("EXPO_OS", "ios");
  const { result } = renderHook(() =>
    useSingleHapticOnPan({ thresholdX: 100, thresholdY: 160 }),
  );
  // Exactly 1.0: the release springs back (swipeDecision needs progress > 1),
  // so the drag must not promise a commit either.
  result.current.singleHapticOnChange(100, 0);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  // The first value past 1.0 fires once.
  result.current.singleHapticOnChange(101, 0);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
});

it("does not dispatch an iOS impact on Android", () => {
  vi.stubEnv("EXPO_OS", "android");
  const { result } = renderHook(() =>
    useSingleHapticOnPan({ thresholdX: 100, thresholdY: 160 }),
  );
  result.current.commitHaptic();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
