export type TidyAction = "keep" | "delete" | "save";

/** The action a drag is heading toward, and how far toward its commit it is. */
type SwipeProgress = {
  action: TidyAction | null;
  progress: number;
};

// Animate Expo's momentum projection, in points (velocity is points/second).
function project(velocity: number) {
  "worklet";
  const decelerationRate = 0.998;
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
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
 * downward drag never does. Returns null when the pan springs back.
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
  return progress > 1 ? action : null;
}
