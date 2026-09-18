// Functional marks on an item page: a recipe's ingredient boxes and its step
// numbers. These are the only ink an item page carries besides the hairline
// and the type-mark sticker.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import {
  bezier,
  ease,
  handEllipse,
  span,
  type Point,
} from "@/lib/ink/geometry";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** A drawn tick-box. Done boxes are ink and carry the tick; the rest are faint. */
export function InkCheckbox({
  size = 20,
  done = false,
  clock,
  seed = 0,
  style,
}: {
  size?: number;
  done?: boolean;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const from = 0.8 + (seed % 8) * 0.05;

  const box = useMemo<{ points: Point[] }[]>(
    () => [
      {
        points: [
          [3, 3],
          [size - 3, 2.5],
          [size - 2.5, size - 3],
          [3, size - 3],
          [3, 3],
        ],
      },
    ],
    [size],
  );
  const tick = useMemo<{ points: Point[] }[]>(
    () => [
      {
        points: bezier(
          [size * 0.25, size * 0.55],
          [size * 0.4, size * 0.7],
          [size * 0.48, size * 0.78],
          [size * 0.8, size * 0.28],
          16,
        ),
        widthScale: 1.7 / 1.3,
      },
    ],
    [size],
  );

  const boxProgress = useDerivedValue(
    () => ease(span(t.value, from, from + 0.4)),
    [t, from],
  );
  const tickProgress = useDerivedValue(
    () => ease(span(t.value, 1.3, 1.6)),
    [t],
  );

  return (
    <InkCanvas width={size} height={size} style={style}>
      <InkStrokes
        strokes={box}
        progress={boxProgress}
        color={done ? theme.colors.foreground : theme.colors.faint}
        width={1.3}
      />
      {done ? (
        <InkStrokes
          strokes={tick}
          progress={tickProgress}
          color={theme.colors.foreground}
          width={1.3}
        />
      ) : null}
    </InkCanvas>
  );
}

/** The hand-drawn ring a step number sits in. The current step's ring is ochre. */
export function StepNumberRing({
  size = 28,
  current = false,
  clock,
  seed = 0,
  style,
}: {
  size?: number;
  current?: boolean;
  clock?: SharedValue<number>;
  seed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const from = 0.9 + (seed % 8) * 0.06;
  const progress = useDerivedValue(
    () => ease(span(t.value, from, from + 0.4)),
    [t, from],
  );
  const strokes = useMemo(
    () => [
      {
        points: handEllipse(
          size / 2,
          size / 2,
          size / 2 - 2,
          size / 2 - 2,
          seed,
        ),
      },
    ],
    [size, seed],
  );

  return (
    <InkCanvas width={size} height={size} style={style}>
      <InkStrokes
        strokes={strokes}
        progress={progress}
        color={current ? theme.colors.ink.thread : theme.colors.foreground}
        width={1.3}
        opacity={current ? 0.95 : 0.6}
      />
    </InkCanvas>
  );
}
