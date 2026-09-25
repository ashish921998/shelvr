// Clocks that drive the ink layer. Every canvas on a screen derives its own
// window from one of these with `span`, so the hairline, shelves and marks
// stay in step instead of each running its own timer.

import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** Long enough for every entry window in the spec (hairline 1s, shelves 0.7s
 * after their stagger, marks 0.4s after their card lands). */
const INK_ENTRY_SECONDS = 3;

/**
 * Seconds since the screen appeared, ramping linearly and then stopping.
 * Under reduce-motion it starts at the end, so the ink is fully drawn on the
 * first frame rather than fading in.
 */
export function useInkClock(seconds = INK_ENTRY_SECONDS): SharedValue<number> {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? seconds : 0);

  useEffect(() => {
    if (reduced) {
      t.value = seconds;
      return;
    }
    t.value = 0;
    t.value = withTiming(seconds, {
      duration: seconds * 1000,
      easing: Easing.linear,
    });
    return () => cancelAnimation(t);
  }, [reduced, seconds, t]);

  return t;
}

/**
 * A clock that runs 0..`period` forever, for the things that keep moving: the
 * thread runner, the inline spinner, the pencil skeleton. Under reduce-motion
 * it holds still at the end of one pass — the spec replaces motion, it does
 * not keep it running slower.
 */
export function useInkLoop(period: number): SharedValue<number> {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? period : 0);

  useEffect(() => {
    if (reduced) {
      t.value = period;
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(period, { duration: period * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [reduced, period, t]);

  return t;
}
