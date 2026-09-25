// Hand-drawn ellipses. The same pen makes three different marks:
// a ring around an avatar or a step number, and the one circled word a screen
// is allowed as its headline accent (never alongside a doodle).

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, handEllipse, span } from "@/lib/ink/geometry";
import { useInkClock } from "@/lib/ink/use-ink-clock";

function useEllipse(
  width: number,
  height: number,
  inset: number,
  seed: number,
) {
  return useMemo(
    () => [
      {
        points: handEllipse(
          width / 2,
          height / 2,
          width / 2 - inset,
          height / 2 - inset,
          seed,
        ),
      },
    ],
    [width, height, inset, seed],
  );
}

/** An ink ring: the active avatar, a step number, the Tidy "all tidy" tick. */
export function InkRing({
  width,
  height,
  clock,
  seed = 0,
  color,
  strokeWidth = 1.5,
  opacity = 0.9,
  style,
}: {
  width: number;
  height: number;
  clock?: SharedValue<number>;
  seed?: number;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 0.4, 1.0)), [t]);
  const strokes = useEllipse(width, height, 3, seed);

  return (
    <InkCanvas width={width} height={height} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={color ?? theme.colors.foreground}
        width={strokeWidth}
        opacity={opacity}
      />
    </InkCanvas>
  );
}

/** The circled word. Ochre, heavier, and drawn late so the headline is read
 * before it is marked. */
export function CircledWord({
  width,
  height,
  clock,
  seed = 0,
  style,
}: {
  width: number;
  height: number;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 1.0, 1.7)), [t]);
  const strokes = useEllipse(width, height, 4, seed);

  return (
    <InkCanvas width={width} height={height} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={theme.colors.ink.thread}
        width={1.6}
      />
    </InkCanvas>
  );
}
