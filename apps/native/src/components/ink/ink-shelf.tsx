// A shelf: the board saves stand on. Drawn only where two or more saves stand
// together (Home, the Shelves tab, a shelf page, Tidy's "Shelved" row). An
// item page has no shelf — there the save is in your hand, not on the wall.

import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { InkCanvas, InkStrokes } from "@/components/ink/ink-canvas";
import { ease, span } from "@/lib/ink/geometry";
import {
  propStrokes,
  shelfStrokes,
  SHELF_PHASES,
  type PropKind,
} from "@/lib/ink/strokes";
import { useInkClock } from "@/lib/ink/use-ink-clock";

/** The canvas is 30 tall and overlaps the cards above it by 4. */
const SHELF_HEIGHT = 30;
const BOARD_Y = 8;

export function InkShelf({
  width,
  clock,
  seed = 0,
  /** At most one prop per shelf. */
  prop,
  /** Where the prop stands, as a fraction of the shelf's width. */
  propAt = 0.86,
  light = false,
  style,
}: {
  width: number;
  clock?: SharedValue<number>;
  seed?: number;
  prop?: PropKind;
  propAt?: number;
  /** A shelf drawn on ink — the paper-coloured variant used on a dark panel. */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useUnistyles();
  const own = useInkClock();
  const t = clock ?? own;
  // Shelves on one screen stagger so the hand appears to work down the page.
  const from = 0.1 + (seed % 7) * 0.06;
  const drawn = useDerivedValue(
    () => ease(span(t.value, from, from + 0.6)),
    [t, from],
  );

  const parts = useMemo(
    () => shelfStrokes(14, width - 14, BOARD_Y, seed),
    [width, seed],
  );
  const board = useDerivedValue(
    () => span(drawn.value, SHELF_PHASES.board[0], SHELF_PHASES.board[1]),
    [drawn],
  );
  const under = useDerivedValue(
    () => span(drawn.value, SHELF_PHASES.under[0], SHELF_PHASES.under[1]),
    [drawn],
  );
  const brackets = useDerivedValue(
    () => span(drawn.value, SHELF_PHASES.brackets[0], SHELF_PHASES.brackets[1]),
    [drawn],
  );

  const color = light ? theme.colors.ink.light : theme.colors.foreground;
  const propSize = 11;

  return (
    <InkCanvas width={width} height={SHELF_HEIGHT} style={style}>
      <InkStrokes
        strokes={[parts.board]}
        progress={board}
        color={color}
        width={1.4}
        opacity={0.85}
      />
      <InkStrokes
        strokes={[parts.under]}
        progress={under}
        color={color}
        width={1.4}
        opacity={0.85}
      />
      <InkStrokes
        strokes={parts.brackets}
        progress={brackets}
        color={color}
        width={1.4}
        opacity={0.85}
      />
      {prop ? (
        <ShelfProp
          kind={prop}
          clock={t}
          seed={seed}
          size={propSize}
          x={width * propAt}
          y={BOARD_Y - propSize}
          color={color}
        />
      ) : null}
    </InkCanvas>
  );
}

/** A prop stands on the board, so it is drawn after the shelf has landed. */
function ShelfProp({
  kind,
  clock,
  seed,
  size,
  x,
  y,
  color,
}: {
  kind: PropKind;
  clock: SharedValue<number>;
  seed: number;
  size: number;
  x: number;
  y: number;
  color: string;
}) {
  const from = 0.8 + (seed % 5) * 0.12;
  const progress = useDerivedValue(
    () => ease(span(clock.value, from, from + 0.5)),
    [clock, from],
  );
  const strokes = useMemo(
    () => propStrokes(kind, size, seed),
    [kind, size, seed],
  );
  return (
    <InkStrokes
      strokes={strokes}
      progress={progress}
      color={color}
      width={1.2}
      opacity={0.8}
      originX={x}
      originY={y}
    />
  );
}
