// The paper map: a faint sketched grid with a slate river running through it.
//
// It is the backdrop for the Map tab's empty state. The live map is a real
// native map — this stands in for it only when there is nothing to pin, where a
// blank screen would read as a failure rather than as "nothing here yet".

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { bezier, ease, span, type Point } from "@/lib/ink/geometry";
import type { Stroke } from "@/lib/ink/strokes";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** The river is drawn in a washed slate that is not one of the ink colours:
 * it is water, not a pen stroke, and reads as the map's one cool note. */
const RIVER = "#a9c4cf";

export function InkMapGrid({
  width,
  height,
  clock,
  style,
}: {
  width: number;
  height: number;
  clock?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  const progress = useDerivedValue(() => ease(span(t.value, 0.1, 1.4)), [t]);

  // Roads wander rather than rule: two across, three down, each a shallow
  // bezier that runs off both edges so the paper reads as a cut from
  // something larger.
  const roads = useMemo<Stroke[]>(() => {
    const across: [Point, Point, Point, Point][] = [
      [
        [-10, height * 0.25],
        [width * 0.3, height * 0.2],
        [width * 0.65, height * 0.3],
        [width + 10, height * 0.25],
      ],
      [
        [-10, height * 0.7],
        [width * 0.35, height * 0.62],
        [width * 0.6, height * 0.78],
        [width + 10, height * 0.72],
      ],
    ];
    const down: [Point, Point, Point, Point][] = [
      [
        [width * 0.25, -10],
        [width * 0.28, height * 0.3],
        [width * 0.2, height * 0.7],
        [width * 0.26, height + 10],
      ],
      [
        [width * 0.6, -10],
        [width * 0.65, height * 0.3],
        [width * 0.57, height * 0.7],
        [width * 0.66, height + 10],
      ],
      [
        [width * 0.87, -10],
        [width * 0.85, height * 0.4],
        [width * 0.92, height * 0.7],
        [width * 0.85, height + 10],
      ],
    ];
    return [...across, ...down].map((curve) => ({
      points: bezier(curve[0], curve[1], curve[2], curve[3], 60),
    }));
  }, [width, height]);

  const river = useMemo<Stroke[]>(
    () => [
      {
        points: bezier(
          [-10, height * 0.45],
          [width * 0.4, height * 0.55],
          [width * 0.75, height * 0.35],
          [width + 10, height * 0.5],
          60,
        ),
      },
    ],
    [width, height],
  );

  return (
    <InkCanvas width={width} height={height} style={style}>
      <InkStrokes
        strokes={roads}
        progress={progress}
        color={theme.colors.faint}
        width={1}
        opacity={0.5}
      />
      <InkStrokes
        strokes={river}
        progress={progress}
        color={RIVER}
        width={5}
        opacity={0.5}
      />
    </InkCanvas>
  );
}
