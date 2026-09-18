// Geometry and timing for the bottom nav (Nav E: the floating paper pill).
// Pure math with no React Native imports, so it runs as a worklet and in Node
// tests, the same as `tab-bar-motion.ts`.
//
// The tab change is not a slide. An invisible hand redraws the bar: the icon
// you leave un-draws, a pencil line wanders along the pill to where you are
// going, the card is sketched there and then becomes paper, and the arriving
// icon inks itself in on top.

/** One hand movement, start to finish. */
export const TAB_CHANGE_MS = 900;

/** Windows within the change, as fractions of `TAB_CHANGE_MS`. Each is handed
 * to `span` to drive one beat. */
export const NAV_BEATS = {
  /** The leaving icon's full-ink strokes retract, and its card fades out. */
  leave: [0, 0.22],
  /** The pencil line's head runs ahead; its tail lifts off behind it. */
  lineHead: [0.12, 0.46],
  lineTail: [0.26, 0.6],
  /** A wobbly outline of the card is sketched at the destination, then fades
   * once the real card has arrived under it. */
  sketch: [0.36, 0.6],
  sketchFade: [0.72, 0.95],
  /** The paper card appears where the sketch was. */
  card: [0.58, 0.78],
  /** The arriving icon inks itself in on top of it. */
  arrive: [0.5, 0.9],
} as const satisfies Record<string, readonly [number, number]>;

/** How long the tab's name hangs above the pill after it lands. */
export const NAME_TAG_MS = 1600;

/** Opacity of a tab that is not the current one. */
export const INACTIVE_OPACITY = 0.45;

/** Centre of tab `index` inside a pill `width` wide. Accepts a fractional
 * index so a value between two tabs lands between their centres. */
export function tabCentre(
  index: number,
  width: number,
  count: number,
  padding: number,
): number {
  "worklet";
  if (count <= 0) return width / 2;
  const inner = width - padding * 2;
  return padding + (inner / count) * (index + 0.5);
}

/**
 * The pencil line from the tab being left to the one being arrived at: a
 * shallow arc that rises over the icons between them. Returned as the four
 * control points of a cubic.
 */
export function pencilArc(
  fromX: number,
  toX: number,
  height: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  "worklet";
  const y = height * 0.66;
  return [
    [fromX, y],
    [fromX, 2],
    [toX, 2],
    [toX, y],
  ];
}

/**
 * A wobbly rounded-rectangle outline of the indicator card, as the hand would
 * sketch it before the paper arrives. `radius` rounds the corners by cutting
 * them, which is what a fast pen does.
 */
export function cardOutline(
  size: number,
  radius: number,
  seed = 0,
): [number, number][] {
  "worklet";
  const r = Math.min(radius, size / 2);
  const corners: [number, number][] = [
    [r, 0],
    [size - r, 0],
    [size, r],
    [size, size - r],
    [size - r, size],
    [r, size],
    [0, size - r],
    [0, r],
    [r, 0],
  ];
  return corners.map(([x, y], i) => [
    x + Math.sin(i * 1.7 + seed) * 0.8,
    y + Math.cos(i * 2.1 + seed) * 0.8,
  ]);
}
