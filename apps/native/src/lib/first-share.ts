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

// One id per JS launch. The launch that first sees an account is its first
// session, and the weekly nudge never interrupts that one.
const LAUNCH_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const firstLaunchKey = (userId: string) => `shelvr.firstLaunch.${userId}`;

export function isFirstSession(userId: string): boolean {
  const first = SecureStore.getItem(firstLaunchKey(userId));
  if (first === null || first === "") {
    SecureStore.setItem(firstLaunchKey(userId), LAUNCH_ID);
    return true;
  }
  return first === LAUNCH_ID;
}

/** The weekly nudge asks only once the shelf holds `goal` real saves (the
 * onboarding demo does not count) and never in the account's first session,
 * which already brings onboarding, the paywall and a permission prompt. */
export function shouldOfferWeeklyNudge({
  firstSession,
  progress,
}: {
  firstSession: boolean;
  progress: { saved: number; goal: number } | undefined;
}): boolean {
  return (
    !firstSession && progress !== undefined && progress.saved >= progress.goal
  );
}

const progressCardKey = (userId: string) =>
  `shelvr.saveProgressCardDismissed.${userId}`;

export function isSaveProgressCardDismissed(userId: string): boolean {
  return SecureStore.getItem(progressCardKey(userId)) === "1";
}

export function dismissSaveProgressCard(userId: string): void {
  SecureStore.setItem(progressCardKey(userId), "1");
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
