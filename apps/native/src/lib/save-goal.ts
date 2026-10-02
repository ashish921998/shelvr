import { analytics } from "@/lib/analytics";
import type { TextMessageKey } from "@/locales/message-types";
import * as SecureStore from "expo-secure-store";

// Per account: the instant this device first saw the shelf short of the save
// goal, then "done" once the goal was reported (or found already met).
const saveGoalKey = (userId: string) => `shelvr.saveGoal.${userId}`;
const DONE = "done";
const HOUR_MS = 60 * 60 * 1000;

type SaveGoalStep =
  | { kind: "none" }
  | { kind: "start"; at: number }
  | { kind: "reached"; hoursSinceStart: number }
  | { kind: "skip" };

/**
 * What one save-progress read means for the "goal reached" signal. The clock
 * starts the first time a shelf is seen short of the goal, which for a new
 * account is its first Home visit after onboarding. A shelf already at the
 * goal when first seen (an existing user) is skipped, so the event only
 * counts shelves that were watched filling up.
 */
export function nextSaveGoalStep(
  stored: string | null,
  progress: { saved: number; goal: number },
  now: number,
): SaveGoalStep {
  if (stored === DONE) return { kind: "none" };
  const start = stored === null || stored === "" ? null : Number(stored);
  if (progress.saved < progress.goal) {
    return start === null || !Number.isFinite(start)
      ? { kind: "start", at: now }
      : { kind: "none" };
  }
  if (start === null || !Number.isFinite(start)) return { kind: "skip" };
  return {
    kind: "reached",
    // One decimal is enough for a "within 48 hours" filter.
    hoursSinceStart: Math.round(((now - start) / HOUR_MS) * 10) / 10,
  };
}

/** Applies `nextSaveGoalStep` for this account and fires
 * `save_goal_reached` once. Storage failures only cost the signal. */
export function trackSaveGoal(
  userId: string,
  progress: { saved: number; goal: number },
  { cardDismissed }: { cardDismissed: boolean },
  now = Date.now(),
): void {
  try {
    const step = nextSaveGoalStep(
      SecureStore.getItem(saveGoalKey(userId)),
      progress,
      now,
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

/** The progress card's title counts down the saves still to go. */
export function progressTitleKey(saved: number, goal: number): TextMessageKey {
  const left = goal - saved;
  if (left <= 1) return "home.progressTitleLast";
  if (left === 2) return "home.progressTitleNext";
  return "home.progressTitleFirst";
}
