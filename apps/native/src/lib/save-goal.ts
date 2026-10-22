import { analytics } from "@/lib/analytics";
import type { TextMessageKey } from "@/locales/message-types";
import * as SecureStore from "expo-secure-store";

const saveGoalKey = (userId: string) => `shelvr.saveGoal.${userId}`;
const DONE = "done";
const HOUR_MS = 60 * 60 * 1000;

type SaveGoalStep =
  | { kind: "none" }
  | { kind: "start"; at: number }
  | { kind: "reached"; hoursSinceStart: number }
  | { kind: "skip" };

export function nextSaveGoalStep(
  stored: string | null,
  progress: { saved: number; goal: number },
  now: number,
  cardVisible = true,
): SaveGoalStep {
  if (stored === DONE) return { kind: "none" };
  const start = stored === null || stored === "" ? null : Number(stored);
  if (progress.saved < progress.goal) {
    return (start === null || !Number.isFinite(start)) && cardVisible
      ? { kind: "start", at: now }
      : { kind: "none" };
  }
  if (start === null || !Number.isFinite(start)) return { kind: "skip" };
  return {
    kind: "reached",
    hoursSinceStart: Math.ceil(((now - start) / HOUR_MS) * 100) / 100,
  };
}

export function trackSaveGoal(
  userId: string,
  progress: { saved: number; goal: number },
  {
    cardDismissed,
    cardVisible,
  }: { cardDismissed: boolean; cardVisible: boolean },
  now = Date.now(),
): void {
  try {
    const step = nextSaveGoalStep(
      SecureStore.getItem(saveGoalKey(userId)),
      progress,
      now,
      cardVisible,
    );
    if (step.kind === "start") {
      SecureStore.setItem(saveGoalKey(userId), String(step.at));
    } else if (step.kind === "skip") {
      SecureStore.setItem(saveGoalKey(userId), DONE);
    } else if (step.kind === "reached") {
      SecureStore.setItem(saveGoalKey(userId), DONE);
      analytics.capture("save_goal_reached", {
        goal: progress.goal,
        hours_since_start: step.hoursSinceStart,
        card_dismissed: cardDismissed,
      });
    }
  } catch (error) {
    analytics.captureError("save_goal_track_failed", error);
  }
}

export function progressTitleKey(saved: number, goal: number): TextMessageKey {
  const left = goal - saved;
  if (left <= 1) return "home.progressTitleLast";
  if (left === 2) return "home.progressTitleNext";
  return "home.progressTitleFirst";
}
