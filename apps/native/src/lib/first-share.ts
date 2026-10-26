import { oncePerAccount } from "@/lib/once-per-account";
import * as SecureStore from "expo-secure-store";

const firstShareKey = (userId: string) => `shelvr.firstShareSaved.${userId}`;

const weeklyNudge = oncePerAccount("weeklyNudge");

export function recordShareSaved(userId: string): void {
  SecureStore.setItem(firstShareKey(userId), "1");
  weeklyNudge.mark(userId);
}

export function hasSavedFirstShare(userId: string): boolean {
  return SecureStore.getItem(firstShareKey(userId)) === "1";
}

export const isWeeklyNudgePending = weeklyNudge.isPending;
export const finishWeeklyNudge = weeklyNudge.finish;

const LAUNCH_ID = `${Date.now()}-${performance.now()}`;
const firstLaunchKey = (userId: string) => `shelvr.firstLaunch.${userId}`;

export function isFirstSession(userId: string): boolean {
  const first = SecureStore.getItem(firstLaunchKey(userId));
  if (first === null || first === "") {
    SecureStore.setItem(firstLaunchKey(userId), LAUNCH_ID);
    return true;
  }
  return first === LAUNCH_ID;
}

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
