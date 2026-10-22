export type TidyAction = "keep" | "delete" | "save";

type SwipeProgress = {
  action: TidyAction | null;
  progress: number;
};

const MOMENTUM_WINDOW_S = 0.05;

function project(velocity: number) {
  "worklet";
  return velocity * MOMENTUM_WINDOW_S;
}

export function swipeProgress(
  x: number,
  y: number,
  panDistanceX: number,
  panDistanceY: number,
): SwipeProgress {
  "worklet";
  const horizontal = Math.abs(x) / panDistanceX;
  const vertical = Math.abs(y) / panDistanceY;
  if (vertical > horizontal) {
    return y < 0
      ? { action: "save", progress: vertical }
      : { action: null, progress: 0 };
  }
  return { action: x >= 0 ? "keep" : "delete", progress: horizontal };
}

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
  const parked = action === "save" ? y : x;
  const projected = action === "save" ? projectedY : projectedX;
  if (parked !== 0 && Math.sign(parked) !== Math.sign(projected)) return null;
  return action;
}
