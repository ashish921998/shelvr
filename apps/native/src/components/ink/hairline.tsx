// The ochre hairline under every header. Always present, drawn left to right
// in 1s on entry. It is the one piece of ink that appears on every screen.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, hairlinePoints, span } from "@/lib/ink/geometry";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** The canvas is 16 tall and sits directly under the 40-tall header row. */
const HAIRLINE_HEIGHT = 16;

export function Hairline({
  width,
  clock,
  seed = 0,
  style,
}: {
  width: number;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 0.05, 1.0)), [t]);
  const strokes = useMemo(
    () => [{ points: hairlinePoints(width, HAIRLINE_HEIGHT) }],
    [width],
  );

  return (
    <InkCanvas width={width} height={HAIRLINE_HEIGHT} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={theme.colors.ink.thread}
        width={1.2}
      />
    </InkCanvas>
  );
}
