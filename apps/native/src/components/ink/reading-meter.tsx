// The ochre reading meter. On an article page it is the same line as the
// header hairline: as the summary scrolls away the hairline becomes the meter
// and fills with how far through you are.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { bezier, ease, span } from "@/lib/ink/geometry";
import { useInkClock } from "@/lib/ink/use-ink-clock";

const METER_HEIGHT = 8;

export function ReadingMeter({
  width,
  /** 0..1 — how far through the article the reader is. */
  progress,
  clock,
  seed = 0,
  style,
}: {
  width: number;
  progress: number;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const y = METER_HEIGHT / 2;

  const track = useMemo(
    () => [
      {
        points: [
          [2, y] as const,
          [width / 2, y] as const,
          [width - 2, y] as const,
        ],
      },
    ],
    [width, y],
  );
  const fill = useMemo(
    () => [
      {
        points: bezier(
          [2, y],
          [width * 0.3, y - 1],
          [width * 0.7, y + 1],
          [2 + (width - 4) * Math.max(0, Math.min(1, progress)), y],
          40,
        ),
      },
    ],
    [width, y, progress],
  );

  const full = useDerivedValue(() => 1, []);
  const drawn = useDerivedValue(() => ease(span(t.value, 1.0, 1.6)), [t]);

  return (
    <InkCanvas width={width} height={METER_HEIGHT} style={style}>
      <InkStrokes
        strokes={track}
        progress={full}
        color={theme.colors.border}
        width={2}
        opacity={1}
      />
      <InkStrokes
        strokes={fill}
        progress={drawn}
        color={theme.colors.ink.thread}
        width={2}
        opacity={0.95}
      />
    </InkCanvas>
  );
}
