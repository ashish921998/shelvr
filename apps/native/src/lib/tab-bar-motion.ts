// Geometry and motion math for the floating Android tab bar. No React Native
// imports, so every function runs as a Reanimated worklet and in Node tests.

/** The furthest a drag past the pill's edge can pull it. The stretch keeps
 * growing with the finger but approaches this value without reaching it. */
export const RUBBER_BAND_LIMIT = 56;

/** Resistance for a drag past an edge: the first few pixels follow the finger
 * almost one to one, then each further pixel moves the pill less, never
 * reaching `limit`. `limit` is a required argument on purpose: a worklet does
 * not capture module constants referenced from default parameter values, so
 * a default here throws on the UI thread even though it works in Node. */
export function rubberBand(overflow: number, limit: number): number {
  "worklet";
  if (overflow === 0 || limit <= 0) return 0;
  const distance = Math.abs(overflow);
  return Math.sign(overflow) * ((limit * distance) / (distance + limit));
}

/** How far `position` lies outside `[0, size]`: negative before the start,
 * positive past the end, and zero inside. */
export function overflowPast(position: number, size: number): number {
  "worklet";
  if (position < 0) return position;
  if (position > size) return position - size;
  return 0;
}

/** The tab under a touch at `x`, or -1 when the touch is outside the pill.
 * `inset` is the pill's inner padding on each side, and a touch inside that
 * padding still selects the nearest tab so the pill has no dead edges. */
export function tabIndexAt(
  x: number,
  width: number,
  count: number,
  inset: number,
): number {
  "worklet";
  if (count <= 0 || x < 0 || x > width) return -1;
  const inner = width - inset * 2;
  if (inner <= 0) return -1;
  const offset = Math.min(Math.max(x - inset, 0), inner);
  return Math.min(count - 1, Math.floor((offset / inner) * count));
}

/** Left edge of the slot for tab `index`. Accepts a fractional index, so a
 * spring between two tabs moves the highlight smoothly between their slots. */
export function tabSlotX(
  index: number,
  width: number,
  count: number,
  inset: number,
): number {
  "worklet";
  if (count <= 0) return inset;
  return inset + ((width - inset * 2) / count) * index;
}
