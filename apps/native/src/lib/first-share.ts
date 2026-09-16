import * as SecureStore from "expo-secure-store";

const FIRST_SHARE_KEY = "shelvr.firstShareSaved";
const WEEKLY_NUDGE_KEY = "shelvr.weeklyNudge";

export function recordShareSaved(): void {
  SecureStore.setItem(FIRST_SHARE_KEY, "1");
  const nudge = SecureStore.getItem(WEEKLY_NUDGE_KEY);
  if (nudge === null || nudge === "") {
    SecureStore.setItem(WEEKLY_NUDGE_KEY, "pending");
  }
}

export function hasSavedFirstShare(): boolean {
  return SecureStore.getItem(FIRST_SHARE_KEY) === "1";
}

export function isWeeklyNudgePending(): boolean {
  return SecureStore.getItem(WEEKLY_NUDGE_KEY) === "pending";
}

export function finishWeeklyNudge(): void {
  SecureStore.setItem(WEEKLY_NUDGE_KEY, "done");
}

export function shouldShowHowTo({
  firstShareSaved,
  itemCount,
}: {
  firstShareSaved: boolean;
  itemCount: number;
}): boolean {
  return !firstShareSaved && itemCount <= 1;
}
