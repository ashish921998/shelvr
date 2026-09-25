// The bookcase the Shelves tab is framed by: two hand-drawn uprights running
// the height of the rows. Structure, not decoration — it is what makes a list
// of shelves read as one piece of furniture.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { bezier, ease, span } from "@/lib/ink/geometry";
import { useInkClock } from "@/lib/ink/use-ink-clock";

export function InkUprights({
  width,
  height,
  clock,
  inset = 14,
  style,
}: {
  width: number;
  height: number;
  clock?: SharedValue<number>;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 0.1, 1.2)), [t]);

  const strokes = useMemo(
    () => [
      {
        points: bezier(
          [inset, 0],
          [inset + 1, height * 0.3],
          [inset - 1, height * 0.7],
          [inset, height],
          60,
        ),
      },
      {
        points: bezier(
          [width - inset, 0],
          [width - inset + 1, height * 0.3],
          [width - inset - 1, height * 0.7],
          [width - inset, height],
          60,
        ),
      },
    ],
    [width, height, inset],
  );

  return (
    <InkCanvas width={width} height={height} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={theme.colors.foreground}
        width={1.6}
        opacity={0.7}
      />
    </InkCanvas>
  );
}
