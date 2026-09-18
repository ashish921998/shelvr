// How a multi-stroke drawing is revealed. The pen draws one stroke at a time
// in order, so a single 0..1 progress has to be split into a per-stroke end.
// Budget is shared by point count, which keeps the pen's apparent speed even
// across strokes of different lengths.

import type { Stroke } from "@/lib/ink/strokes";

/** Per-stroke end fractions for `progress`, in the same order as `strokes`.
 * A stroke not reached yet gets 0; one already finished gets 1. */
export function revealEnds(
  strokes: readonly Stroke[],
  progress: number,
): number[] {
  "worklet";
  const total = strokes.reduce((n, s) => n + s.points.length, 0);
  if (total === 0) return strokes.map(() => 0);
  let budget = Math.max(0, Math.min(1, progress)) * total;
  return strokes.map((stroke) => {
    const length = stroke.points.length;
    if (budget <= 0) return 0;
    if (budget >= length) {
      budget -= length;
      return 1;
    }
    const end = budget / length;
    budget = 0;
    return end;
  });
}

/** Staggers one element out of many: element `index` starts `step` seconds
 * after the one before it and runs for `duration`. Returns the window to hand
 * to `span`. `cycle` wraps the stagger so a long list does not wait forever. */
export function staggerWindow(
  index: number,
  start: number,
  duration: number,
  step: number,
  cycle = Infinity,
): [number, number] {
  "worklet";
  const from = start + (index % cycle) * step;
  return [from, from + duration];
}
