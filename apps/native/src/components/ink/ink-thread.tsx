// The thread. An ochre running segment with a head that leads and a tail that
// lifts off the paper. It is only ever on screen while something is moving —
// loading, a save landing, a suggestion joining a shelf, a tab change — and
// it fades only after the thing it led has settled.

import { useMemo } from "react";
import { Group, Path, Skia } from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas } from "@/components/ink/ink-canvas";
import { bezier, runnerSlice, type Point } from "@/lib/ink/geometry";
import { useInkLoop } from "@/lib/ink/use-ink-clock";

/** Turns the currently-inked slice into a path each frame. The slice changes
 * length as the head runs and the tail lifts, so unlike a static drawing this
 * one is rebuilt rather than trimmed. */
function useRunnerPath(
  path: readonly Point[],
  cycle: SharedValue<number>,
  period: number,
) {
  return useDerivedValue(() => {
    const slice = runnerSlice(path, (cycle.value / period) % 1);
    const p = Skia.Path.Make();
    if (!slice) return p;
    slice.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    return p;
  }, [path, cycle, period]);
}

/** The loading thread: a figure-eight runner over a drawn shelf. */
export function ThreadLoop({
  width,
  height,
  period = 2,
  style,
}: {
  width: number;
  height: number;
  period?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const clock = useInkLoop(period);
  const path = useMemo(
    () =>
      bezier(
        [10, height * 0.6],
        [10, -height * 0.3],
        [width - 10, height * 1.3],
        [width - 10, height * 0.4],
        200,
      ),
    [width, height],
  );
  const runner = useRunnerPath(path, clock, period);

  return (
    <InkCanvas width={width} height={height} style={style}>
      <Group opacity={0.9}>
        <Path
          path={runner}
          color={theme.colors.ink.thread}
          style="stroke"
          strokeWidth={1.4}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
    </InkCanvas>
  );
}

/** The inline spinner: a runner around a circle that never quite closes. */
export function InkSpinner({
  size = 28,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  // 0.75 revolutions a second.
  const period = 1 / 0.75;
  const clock = useInkLoop(period);
  const path = useMemo(() => {
    const pts: Point[] = [];
    const r = size / 2 - 6;
    for (let k = 0; k <= 90; k++) {
      const a = -Math.PI / 2 + (k / 90) * Math.PI * 2 * 1.02;
      pts.push([size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r]);
    }
    return pts;
  }, [size]);
  const runner = useRunnerPath(path, clock, period);

  return (
    <InkCanvas width={size} height={size} style={style}>
      <Group opacity={0.9}>
        <Path
          path={runner}
          color={theme.colors.ink.thread}
          style="stroke"
          strokeWidth={1.7}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
    </InkCanvas>
  );
}
