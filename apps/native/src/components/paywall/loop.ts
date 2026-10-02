import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * A 0 → 1 clock that repeats every `durationMs` while `running`, for the
 * paywall slides' keyframe loops. Stopped, it holds `rest`, the frame the
 * README names for Reduce Motion (and for slides off screen).
 */
export function useLoop(
  durationMs: number,
  running: boolean,
  rest: number,
): SharedValue<number> {
  const progress = useSharedValue(rest);
  useEffect(() => {
    cancelAnimation(progress);
    if (!running) {
      progress.value = rest;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [durationMs, running, rest, progress]);
  return progress;
}

/** The loop's phase shifted by `offset` of a cycle (CSS animation-delay). */
export function phase(progress: number, offset: number): number {
  "worklet";
  const shifted = (progress + offset) % 1;
  return shifted < 0 ? shifted + 1 : shifted;
}

/**
 * A CSS-style keyframe track: `at` holds the stops as fractions of the loop
 * and `values` the value at each. Held flat before the first and after the
 * last stop.
 */
export function track(
  p: number,
  at: readonly number[],
  values: readonly number[],
): number {
  "worklet";
  return interpolate(
    p,
    at as number[],
    values as number[],
    Extrapolation.CLAMP,
  );
}
