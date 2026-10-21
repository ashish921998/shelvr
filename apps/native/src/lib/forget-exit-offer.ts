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

export async function forgetExitOffer(userId: string): Promise<void> {
  if (forgotten.has(userId)) return;
  forgotten.add(userId);
  const steps = [
    () => Notifications.cancelScheduledNotificationAsync(REMINDER_ID),
    ...keys(userId).map((key) => () => SecureStore.deleteItemAsync(key)),
  ];
  // Async wrappers turn a synchronous throw into a rejection, so one failure
  // never skips the rest.
  await Promise.allSettled(steps.map(async (step) => step()));
}

export function useForgetExitOffer(): void {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  useEffect(() => {
    if (userId) void forgetExitOffer(userId);
  }, [userId]);
}
