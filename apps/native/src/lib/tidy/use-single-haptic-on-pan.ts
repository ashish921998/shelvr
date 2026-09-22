import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { swipeProgress } from "./swipe-decision";

function fire() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

type Params = {
  /** Horizontal commit distance, in points. */
  thresholdX: number;
  /** Upward commit distance, in points. */
  thresholdY: number;
};

/**
 * Latch on the UI thread: at most one light impact per pan, including a
 * short flick. `resetHaptic` re-arms on grab, `commitHaptic` fires when a
 * decision commits even if the threshold was never crossed during the drag.
 * The mid-drag trigger reads the shared dominance rule, so the haptic
 * promises a commit only when the release would grant one.
 */
export function useSingleHapticOnPan({ thresholdX, thresholdY }: Params) {
  const isTriggered = useSharedValue(false);

  const resetHaptic = useCallback(() => {
    "worklet";
    isTriggered.set(false);
  }, [isTriggered]);

  const commitHaptic = useCallback(() => {
    "worklet";
    if (!isTriggered.get()) {
      isTriggered.set(true);
      scheduleOnRN(fire);
    }
  }, [isTriggered]);

  // Stable identity so the gesture that captures it can be memoized — a
  // recreated gesture instance re-attaches mid-pan and drops touches.
  const singleHapticOnChange = useCallback(
    (x: number, y: number) => {
      "worklet";
      const { progress } = swipeProgress(x, y, thresholdX, thresholdY);
      // Fire only past the same > 1 bar the release commits at, so a drag
      // that will spring back never promises a commit first.
      if (progress > 1) commitHaptic();
    },
    [thresholdX, thresholdY, commitHaptic],
  );

  return { singleHapticOnChange, resetHaptic, commitHaptic };
}
