import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement, useExitOfferEndsAt } from "@/lib/entitlement";
import { exitOfferReminderAt } from "@/lib/exit-offer";
import { t } from "@/lib/i18n";
import { canNotify } from "@/lib/trial-reminder";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * One local notification an hour before the exit offer closes, sent only to
 * people who tapped "Remind me" on the Home countdown. A reminder about a
 * discount is promotional, and App Review guideline 4.5.4 requires explicit
 * opt-in through in-app consent language plus a way to opt out, so nothing is
 * scheduled without that tap, and "Cancel reminder" undoes it. The opt-in
 * belongs to one offer window and disappears with the offer: bought, expired,
 * or signed out.
 */

export const EXIT_OFFER_REMINDER_ID = "shelvr.exit-offer-ending";
const CHANNEL_ID = "trial-reminder";

const optInKey = (userId: string) => `shelvr.exitOffer.remind.${userId}`;

// The opt-in stores the window it was given for, so a later window starts
// without a reminder until the user asks again.
function readOptIn(userId: string): number | null {
  try {
    const value = Number(SecureStore.getItem(optInKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((read) => read());
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Whether this account asked to be reminded about the window ending at `endsAt`. */
export function useExitOfferReminderOptIn(
  userId: string | undefined,
  endsAt: number | null,
): boolean {
  const optedFor = useSyncExternalStore(subscribe, () =>
    userId ? readOptIn(userId) : null,
  );
  return endsAt !== null && optedFor === endsAt;
}

async function ensureChannel(): Promise<void> {
  // Android 13 cannot request notification permission before a channel exists.
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t("notifications.trialChannel"),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * The user's "Remind me" tap. Asks for notification permission only here,
 * in answer to that tap. Returns whether a reminder can be delivered.
 */
export async function optInToExitOfferReminder(
  userId: string,
  endsAt: number,
): Promise<boolean> {
  await ensureChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!canNotify(permission) && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  const granted = canNotify(permission);
  analytics.capture("exit_offer_reminder_opt_in", { granted });
  if (!granted) return false;
  try {
    SecureStore.setItem(optInKey(userId), String(endsAt));
  } catch {
    return false;
  }
  notify();
  return true;
}

/** "Cancel reminder": the opt-out. */
export function optOutOfExitOfferReminder(userId: string): void {
  try {
    SecureStore.deleteItemAsync(optInKey(userId))
      .then(notify)
      .catch(() => {});
  } catch {
    // Best-effort; the sync below still cancels the scheduled reminder.
  }
  analytics.capture("exit_offer_reminder_opt_out", {});
  notify();
}

export async function syncExitOfferReminder(
  endsAt: number | null,
  now: number,
): Promise<boolean> {
  await Notifications.cancelScheduledNotificationAsync(EXIT_OFFER_REMINDER_ID);
  const fireAt = endsAt === null ? null : exitOfferReminderAt(endsAt, now);
  if (fireAt === null) return false;
  if (!canNotify(await Notifications.getPermissionsAsync())) return false;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: EXIT_OFFER_REMINDER_ID,
    content: {
      title: t("exitOffer.reminderTitle"),
      body: t("exitOffer.reminderBody"),
      data: { url: "/", kind: "exit_offer_reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

export function useExitOfferReminder(): void {
  const { entitled, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const endsAt = useExitOfferEndsAt(userId);
  const optedIn = useExitOfferReminderOptIn(userId, endsAt);
  const target = !loading && !entitled && optedIn ? endsAt : null;

  useEffect(() => {
    syncExitOfferReminder(target, Date.now()).catch((error) =>
      analytics.captureError("exit_offer_reminder_failed", error),
    );
  }, [target]);
}
