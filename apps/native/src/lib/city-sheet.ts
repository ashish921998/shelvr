/** Where the city page's places sheet can rest, as distances from the top of the screen. */
export type SheetSnaps = {
  expanded: number;
  middle: number;
  collapsed: number;
};

// The back button's bottom edge, below the safe area.
const EXPANDED_BELOW_INSET = 52;
// The grabber, city name, place count and plan buttons, until they are measured.
const COLLAPSED_VISIBLE = 176;
// How far a flick carries the sheet past where the finger let go, in seconds of its speed.
const FLICK_SECONDS = 0.2;

export function sheetSnaps(view: {
  height: number;
  insetTop: number;
  insetBottom: number;
  middle: number;
  /** The measured height of what stays showing when the sheet is down, above the bottom inset. */
  collapsedVisible?: number;
}): SheetSnaps {
  const expanded = view.insetTop + EXPANDED_BELOW_INSET;
  const collapsed = Math.max(
    expanded,
    view.height -
      view.insetBottom -
      (view.collapsedVisible ?? COLLAPSED_VISIBLE),
  );
  return {
    expanded,
    middle: Math.min(Math.max(view.middle, expanded), collapsed),
    collapsed,
  };
}

/** The rest point nearest to where a drag, carried on by its speed, would land. */
export function settleSheet(
  top: number,
  velocityY: number,
  snaps: SheetSnaps,
): number {
  "worklet";
  const landing = top + velocityY * FLICK_SECONDS;
  const points = [snaps.expanded, snaps.middle, snaps.collapsed];
  return points.reduce((best, point) =>
    Math.abs(point - landing) < Math.abs(best - landing) ? point : best,
  );
}

/** The next rest point up (`-1`) or down (`1`) from `top`, for assistive technology. */
export function stepSheet(
  top: number,
  direction: -1 | 1,
  snaps: SheetSnaps,
): number {
  const points = [snaps.expanded, snaps.middle, snaps.collapsed];
  const nearest = points.indexOf(settleSheet(top, 0, snaps));
  return points[Math.min(points.length - 1, Math.max(0, nearest + direction))];
}
