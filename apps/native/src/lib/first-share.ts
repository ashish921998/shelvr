import * as SecureStore from "expo-secure-store";

// Keyed per account so a second account on the same phone still gets the
// how-to card and the weekly nudge.
const firstShareKey = (userId: string) => `shelvr.firstShareSaved.${userId}`;
const weeklyNudgeKey = (userId: string) => `shelvr.weeklyNudge.${userId}`;

export function recordShareSaved(userId: string): void {
  SecureStore.setItem(firstShareKey(userId), "1");
  const nudge = SecureStore.getItem(weeklyNudgeKey(userId));
  if (nudge === null || nudge === "") {
    SecureStore.setItem(weeklyNudgeKey(userId), "pending");
  }
}

export function hasSavedFirstShare(userId: string): boolean {
  return SecureStore.getItem(firstShareKey(userId)) === "1";
}

export function isWeeklyNudgePending(userId: string): boolean {
  return SecureStore.getItem(weeklyNudgeKey(userId)) === "pending";
}

export function finishWeeklyNudge(userId: string): void {
  SecureStore.setItem(weeklyNudgeKey(userId), "done");
}

/** The guide shows until the first share records the flag, and only while the
 * library is nearly empty. The onboarding demo records the flag when it saves
 * through the real share sheet, so only the paste or type demo still sees it.
 * Larger libraries, including existing users', skip the guide. */
export function shouldShowHowTo({
  firstShareSaved,
  itemCount,
}: {
  firstShareSaved: boolean;
  itemCount: number;
}): boolean {
  return !firstShareSaved && itemCount <= 1;
}
