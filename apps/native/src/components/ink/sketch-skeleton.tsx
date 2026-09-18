// Loading is a pencil sketch of what is coming, at real size and in place —
// never a grey block and never a spinner. The sketch redraws every 3.2s.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, handEllipse, span, type Point } from "@/lib/ink/geometry";
import { useInkLoop } from "@/lib/ink/use-ink-clock";

const PERIOD = 3.2;

export function SketchSkeleton({
  width,
  height,
  style,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const t = useInkLoop(PERIOD);

  // The card outline, its image well, two text lines and the sticker circle,
  // each on its own window so the pencil works through them in order.
  const outline = useMemo<{ points: Point[] }[]>(
    () => [
      {
        points: [
          [12, 10],
          [width / 2, 9],
          [width - 12, 10],
          [width - 11, height / 2],
          [width - 12, height - 10],
          [width / 2, height - 9],
          [12, height - 10],
          [13, height / 2],
          [12, 10],
        ],
      },
    ],
    [width, height],
  );
  const well = useMemo<{ points: Point[] }[]>(
    () => [
      {
        points: [
          [20, 18],
          [width / 2, 17],
          [width - 20, 18],
          [width - 20, height * 0.56],
          [width / 2, height * 0.57],
          [20, height * 0.56],
          [20, 18],
        ],
      },
    ],
    [width, height],
  );
  const lines = useMemo<{ points: Point[] }[]>(
    () => [
      {
        points: [
          [20, height * 0.72],
          [width * 0.4, height * 0.72],
          [width * 0.7, height * 0.72],
        ],
      },
      {
        points: [
          [20, height * 0.84],
          [width * 0.3, height * 0.84],
          [width * 0.5, height * 0.84],
        ],
      },
    ],
    [width, height],
  );
  const sticker = useMemo(() => [{ points: handEllipse(14, 12, 9, 9, 5) }], []);

  const fade = useDerivedValue(() => 1 - ease(span(t.value, 2.6, PERIOD)), [t]);
  const pOutline = useDerivedValue(() => ease(span(t.value, 0, 0.7)), [t]);
  const pWell = useDerivedValue(() => ease(span(t.value, 0.5, 1.0)), [t]);
  const pLine1 = useDerivedValue(() => ease(span(t.value, 0.9, 1.15)), [t]);
  const pLine2 = useDerivedValue(() => ease(span(t.value, 1.1, 1.3)), [t]);
  const pSticker = useDerivedValue(() => ease(span(t.value, 1.35, 1.7)), [t]);

  const pencil = theme.colors.faint;

  return (
    <InkCanvas width={width} height={height} style={style}>
      {/* The dashed effect is what makes it read as a sketch rather than a
          finished outline; the sticker circle is drawn solid. */}
      <InkStrokes
        strokes={outline}
        progress={pOutline}
        color={pencil}
        width={1.4}
        opacity={fade}
        dash={[4, 3]}
      />
      <InkStrokes
        strokes={well}
        progress={pWell}
        color={pencil}
        width={1.4}
        opacity={fade}
        dash={[4, 3]}
      />
      <InkStrokes
        strokes={[lines[0]]}
        progress={pLine1}
        color={pencil}
        width={1.4}
        opacity={fade}
      />
      <InkStrokes
        strokes={[lines[1]]}
        progress={pLine2}
        color={pencil}
        width={1.4}
        opacity={fade}
      />
      <InkStrokes
        strokes={sticker}
        progress={pSticker}
        color={pencil}
        width={1.4}
        opacity={fade}
      />
    </InkCanvas>
  );
}
