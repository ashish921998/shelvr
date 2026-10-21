import { useCurrentUser } from "@/lib/current-user";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

/**
 * The exit offer (a discounted paywall after a close, with a Home countdown
 * and an opt-in reminder) was removed. Builds that had it may still hold a
 * scheduled reminder and the offer's per-account keys, so each launch cancels
 * the one and deletes the others once per account, best effort.
 */

const REMINDER_ID = "shelvr.exit-offer-ending";
const keys = (userId: string) => [
  `shelvr.exitOffer.remind.${userId}`,
  `shelvr.exitOffer.shownAt.${userId}`,
];

const forgotten = new Set<string>();
let cancelled = false;

// Async wrappers turn a synchronous throw into a rejection, so one failure
// never skips the rest.
const settle = (steps: (() => unknown)[]) =>
  Promise.allSettled(steps.map(async (step) => step()));

/** The reminder is per device, so it goes even before the account is known. */
export async function cancelExitOfferReminder(): Promise<void> {
  if (cancelled) return;
  cancelled = true;
  await settle([
    () => Notifications.cancelScheduledNotificationAsync(REMINDER_ID),
  ]);
}

export async function forgetExitOffer(userId: string): Promise<void> {
  if (forgotten.has(userId)) return;
  forgotten.add(userId);
  await settle(
    keys(userId).map((key) => () => SecureStore.deleteItemAsync(key)),
  );
}

export function useForgetExitOffer(): void {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  useEffect(() => {
    void cancelExitOfferReminder();
  }, []);
  useEffect(() => {
    if (userId) void forgetExitOffer(userId);
  }, [userId]);
}
