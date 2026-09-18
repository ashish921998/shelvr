// The bridge from stroke geometry to Skia. Everything drawn in the app goes
// through here, so the global pen rules — round caps and joins, one weight per
// drawing, reveal along length rather than by opacity — live in one place.

import {
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { revealEnds } from "@/lib/ink/reveal";
import type { Point } from "@/lib/ink/geometry";
import type { Stroke } from "@/lib/ink/strokes";

/** Ink is decoration. It never announces itself and never takes a touch. */
export const INK_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  pointerEvents: "none",
} as const;

function toPath(points: readonly Point[]): SkPath {
  const path = Skia.Path.Make();
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  return path;
}

/** A Skia surface sized in points, hidden from screen readers and touches. */
export function InkCanvas({
  width,
  height,
  style,
  children,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Canvas style={[{ width, height }, style]} {...INK_A11Y}>
      {children}
    </Canvas>
  );
}

/**
 * Draws `strokes` in order, revealing them along their length as `progress`
 * runs 0..1. `width` is the drawing's base weight; a stroke's own
 * `widthScale` multiplies it (the shelf board, the article mark's heading).
 */
export function InkStrokes({
  strokes,
  progress,
  color,
  width,
  opacity = 0.9,
  originX = 0,
  originY = 0,
  dash,
}: {
  strokes: readonly Stroke[];
  progress: SharedValue<number>;
  color: string;
  width: number;
  opacity?: number | SharedValue<number>;
  originX?: number;
  originY?: number;
  /** Dashes the stroke, which is what makes a loading sketch read as pencil
   * rather than as a finished outline. */
  dash?: readonly [number, number];
}) {
  const paths = useMemo(() => strokes.map((s) => toPath(s.points)), [strokes]);
  const ends = useDerivedValue(
    () => revealEnds(strokes, progress.value),
    [strokes, progress],
  );

  return (
    <Group
      transform={[{ translateX: originX }, { translateY: originY }]}
      opacity={opacity}
    >
      {paths.map((path, i) => (
        <RevealedStroke
          key={i}
          path={path}
          ends={ends}
          index={i}
          color={color}
          width={width * (strokes[i].widthScale ?? 1)}
          dash={dash}
        />
      ))}
    </Group>
  );
}

/** One stroke. Split out so each gets its own derived end without the parent
 * having to know how many strokes a drawing has. */
function RevealedStroke({
  path,
  ends,
  index,
  color,
  width,
  dash,
}: {
  path: SkPath;
  ends: SharedValue<number[]>;
  index: number;
  color: string;
  width: number;
  dash?: readonly [number, number];
}) {
  const end = useDerivedValue(() => ends.value[index] ?? 0, [ends, index]);
  return (
    <Path
      path={path}
      end={end}
      color={color}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      strokeJoin="round"
    >
      {dash ? <DashPathEffect intervals={[dash[0], dash[1]]} /> : null}
    </Path>
  );
}

/** A solid shape — only the video mark's play triangle and the dots of a
 * loading line. Everything else in the ink layer is a stroke. */
export function InkFill({
  points,
  color,
  opacity = 0.9,
  originX = 0,
  originY = 0,
}: {
  points: readonly Point[];
  color: string;
  opacity?: number | SharedValue<number>;
  originX?: number;
  originY?: number;
}) {
  const path = useMemo(() => {
    const p = toPath(points);
    p.close();
    return p;
  }, [points]);
  return (
    <Group
      transform={[{ translateX: originX }, { translateY: originY }]}
      opacity={opacity}
    >
      <Path path={path} color={color} style="fill" />
    </Group>
  );
}
