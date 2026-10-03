export type TidyAction = "keep" | "delete" | "save";

/** The action a drag is heading toward, and how far toward its commit it is. */
type SwipeProgress = {
  action: TidyAction | null;
  progress: number;
};

// Release-momentum window in seconds: the travel the finger's parting speed
// adds after the lift. 0.05s is RNGH Swipeable's DRAG_TOSS, the convention
// for swipe-a-card releases. The old 0.998-deceleration projection (~0.5s of
// coast) let an aborting pull-back at ~500 pt/s project ~250 pt and commit
// the opposite action from rest.
const MOMENTUM_WINDOW_S = 0.05;

// The extra travel release velocity contributes, in points.
function project(velocity: number) {
  "worklet";
  return velocity * MOMENTUM_WINDOW_S;
}

/**
 * The one "how far toward a commit is this drag" rule every tidy cue reads.
 * The dominant axis owns the gesture, an exact tie goes horizontal, and a
 * downward-dominant drag heads nowhere, so it scores zero. The deck reveal,
 * the commit haptic, the hint badges and the release decision all derive
 * from this, so no cue can promise a commit the release will refuse.
 */
export function swipeProgress(
  x: number,
  y: number,
  panDistanceX: number,
  panDistanceY: number,
): SwipeProgress {
  "worklet";
  const horizontal = Math.abs(x) / panDistanceX;
  // Dominance compares magnitudes. Weighing horizontal against the signed
  // upward score let a downward gesture score negative, so any horizontal
  // release noise won the axis outright and committed.
  const vertical = Math.abs(y) / panDistanceY;
  if (vertical > horizontal) {
    return y < 0
      ? { action: "save", progress: vertical }
      : { action: null, progress: 0 };
  }
  return { action: x >= 0 ? "keep" : "delete", progress: horizontal };
}

/**
 * Pure commit decision for a released tidy card: the dominant projected axis
 * wins, so a fast flick commits even when its translation is short and a
 * downward drag never does. Momentum may extend a drag in its own direction
 * but never carry its projection across rest, so a pull-back release springs
 * home. Returns null when the pan springs back.
 */
export function swipeDecision(
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  thresholdX: number,
  thresholdY: number,
): TidyAction | null {
  "worklet";
  const projectedX = x + project(velocityX);
  const projectedY = y + project(velocityY);
  const { action, progress } = swipeProgress(
    projectedX,
    projectedY,
    thresholdX,
    thresholdY,
  );
  if (action === null || progress <= 1) return null;
  // The direction guard, on the deciding axis alone: a projection landing on
  // the far side of the origin from where the card sat is a reversal at lift,
  // not a commit direction. Momentum may speed a drag up, never turn it
  // around. The losing axis carries drift, and reversing a few points of
  // drift must not veto the axis that owns the gesture.
  const parked = action === "save" ? y : x;
  const projected = action === "save" ? projectedY : projectedX;
  if (parked !== 0 && Math.sign(parked) !== Math.sign(projected)) return null;
  return action;
}
