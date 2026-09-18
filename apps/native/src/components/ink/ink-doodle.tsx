// A headline doodle. One per screen at most, and never on a screen that
// already circles a word.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, span } from "@/lib/ink/geometry";
import { doodleStrokes, type DoodleKind } from "@/lib/ink/strokes";
import { useInkClock } from "@/lib/ink/use-ink-clock";

export function InkDoodle({
  kind,
  size,
  clock,
  seed = 0,
  style,
}: {
  kind: DoodleKind;
  size: number;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 1.1, 1.9)), [t]);
  const strokes = useMemo(
    () => doodleStrokes(kind, size * 0.42, seed),
    [kind, size, seed],
  );

  return (
    <InkCanvas width={size} height={size} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={
          kind === "recipe"
            ? theme.colors.ink.terracotta
            : theme.colors.foreground
        }
        width={1.3}
        opacity={0.85}
        originX={size / 2}
        originY={size / 2}
      />
    </InkCanvas>
  );
}
