import { analytics } from "@/lib/analytics";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

export function useLiveReducedMotion() {
  const [reduced, setReduced] = useState(useReducedMotion());
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        changed = true;
        setReduced(enabled);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted && !changed) setReduced(enabled);
      })
      .catch((error: unknown) =>
        analytics.captureError("reduced_motion_read_failed", error),
      );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
