import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

function fire() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

type Params = {
  thresholdX: number;
  /** Upward-drag threshold (positive number; compared against -y). */
  thresholdY: number;
};

/**
 * Latch on the UI thread: at most one light impact per pan, including a
 * short flick. `resetHaptic` re-arms on grab, `commitHaptic` fires when a
 * decision commits even if the threshold was never crossed during the drag.
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
      if (Math.abs(x) > thresholdX || -y > thresholdY) commitHaptic();
    },
    [thresholdX, thresholdY, commitHaptic],
  );

  return { singleHapticOnChange, resetHaptic, commitHaptic };
}
