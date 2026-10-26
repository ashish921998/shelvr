import { useCurrentUser } from "@/lib/current-user";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

const REMINDER_ID = "shelvr.exit-offer-ending";
const keys = (userId: string) => [
  `shelvr.exitOffer.remind.${userId}`,
  `shelvr.exitOffer.shownAt.${userId}`,
];

const forgotten = new Set<string>();
let cancelled = false;

const settle = (steps: (() => unknown)[]) =>
  Promise.allSettled(steps.map(async (step) => step()));

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
