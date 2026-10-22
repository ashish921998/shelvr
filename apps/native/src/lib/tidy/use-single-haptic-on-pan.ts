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
  thresholdX: number;
  thresholdY: number;
};

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

  const singleHapticOnChange = useCallback(
    (x: number, y: number) => {
      "worklet";
      const { progress } = swipeProgress(x, y, thresholdX, thresholdY);
      if (progress > 1) commitHaptic();
    },
    [thresholdX, thresholdY, commitHaptic],
  );

  return { singleHapticOnChange, resetHaptic, commitHaptic };
}
