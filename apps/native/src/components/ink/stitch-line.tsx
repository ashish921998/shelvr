// Sashiko stitches: 6 on, 4 off, drawn left to right. They close a moment —
// under a shelf when a save lands, as a sheet's only divider, under the name
// tag on the nav — and never decorate an edge for its own sake.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, span, stitchSegments } from "@/lib/ink/geometry";
import type { Stroke } from "@/lib/ink/strokes";
import { useInkClock } from "@/lib/ink/use-ink-clock";

const STITCH_HEIGHT = 10;

export function StitchLine({
  width,
  clock,
  seed = 0,
  /** `light` is the working state on an ink button, where the paper colour
   * has to read against the ink fill. */
  light = false,
  inset = 12,
  style,
}: {
  width: number;
  clock?: SharedValue<number>;
  seed?: number;
  light?: boolean;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 0.4, 1.3)), [t]);

  // The stitch pattern is fixed; `progress` reveals it by trimming each dash,
  // so the geometry is built once at full length.
  const strokes = useMemo<Stroke[]>(
    () =>
      stitchSegments(inset, width - inset, STITCH_HEIGHT / 2, 1, seed).map(
        (s) => ({
          points: [s.from, s.to],
        }),
      ),
    [width, inset, seed],
  );
  const ends = useMemo(() => strokes.length, [strokes]);
  const revealed = useDerivedValue(() => {
    // Dashes appear one at a time rather than all growing together.
    const shown = progress.value * ends;
    return Math.max(0, Math.min(1, shown / Math.max(1, ends)));
  }, [progress, ends]);

  return (
    <InkCanvas width={width} height={STITCH_HEIGHT} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={revealed}
        color={light ? theme.colors.ink.light : theme.colors.ink.thread}
        width={1.5}
        opacity={light ? 0.85 : 0.9}
      />
    </InkCanvas>
  );
}
