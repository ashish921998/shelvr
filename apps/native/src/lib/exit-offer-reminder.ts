import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement, useExitOfferEndsAt } from "@/lib/entitlement";
import { exitOfferReminderPlan } from "@/lib/exit-offer";
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

// Bumped when the session ends, so an opt-in still waiting on the
// permission prompt cannot record itself afterwards.
let sessionGeneration = 0;

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
  const session = sessionGeneration;
  await ensureChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!canNotify(permission) && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  const granted = canNotify(permission);
  analytics.capture("exit_offer_reminder_opt_in", { granted });
  // Signed out while the permission prompt was up: nothing to remember.
  if (!granted || session !== sessionGeneration) return false;
  try {
    SecureStore.setItem(optInKey(userId), String(endsAt));
  } catch {
    return false;
  }
  notify();
  return true;
}

/** "Cancel reminder": the opt-out. Cancels the scheduled reminder first. */
export async function optOutOfExitOfferReminder(userId: string): Promise<void> {
  analytics.capture("exit_offer_reminder_opt_out", {});
  await applyTarget(null);
  try {
    await SecureStore.deleteItemAsync(optInKey(userId));
  } catch {
    // An unreadable value counts as opted out, so a failed delete can't
    // bring the reminder back on the next launch.
    try {
      SecureStore.setItem(optInKey(userId), "0");
    } catch {
      // Nothing more to try; the reminder itself is already cancelled.
    }
  }
  notify();
}

/**
 * Brings the scheduled reminder in line with `exitOfferReminderPlan`: cancels
 * it, and then schedules it again when the window still has time for one.
 * `stillWanted` is checked just before scheduling, so a sync that was waiting
 * on the OS never brings back a reminder the user cancelled in the meantime.
 */
export async function syncExitOfferReminder(
  endsAt: number | null,
  now: number,
  stillWanted: () => boolean = () => true,
): Promise<boolean> {
  const plan = exitOfferReminderPlan(endsAt, now);
  if (plan.kind === "keep") return false;
  await Notifications.cancelScheduledNotificationAsync(EXIT_OFFER_REMINDER_ID);
  if (plan.kind === "cancel") return false;
  if (!canNotify(await Notifications.getPermissionsAsync())) return false;
  await ensureChannel();
  if (!stillWanted()) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: EXIT_OFFER_REMINDER_ID,
    content: {
      title: t("exitOffer.reminderTitle"),
      body: t("exitOffer.reminderBody"),
      data: { url: "/", kind: "exit_offer_reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(plan.fireAt),
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

// Every sync shares one notification id, so they run one at a time, and each
// schedules only while its target is still the latest one asked for.
let wanted: number | null = null;
let queue: Promise<unknown> = Promise.resolve();
function applyTarget(target: number | null): Promise<boolean> {
  wanted = target;
  const next = queue.then(() =>
    syncExitOfferReminder(target, Date.now(), () => wanted === target),
  );
  queue = next.catch(() => undefined);
  return next;
}

// The account whose opt-in the mounted hook last saw, so ending the session
// can clear it after the app screens have unmounted.
let activeUserId: string | null = null;

/**
 * Sign-out and account deletion: drops the opt-in and the scheduled reminder,
 * so nothing about this offer arrives once the account has left the device.
 */
export async function clearExitOfferReminder(): Promise<void> {
  sessionGeneration += 1;
  const userId = activeUserId;
  activeUserId = null;
  try {
    if (userId) await SecureStore.deleteItemAsync(optInKey(userId));
  } catch (error) {
    analytics.captureError("exit_offer_reminder_failed", error);
  }
  notify();
  await applyTarget(null).catch((error) =>
    analytics.captureError("exit_offer_reminder_failed", error),
  );
}

export function useExitOfferReminder(): void {
  const { entitled, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const endsAt = useExitOfferEndsAt(userId);
  const optedIn = useExitOfferReminderOptIn(userId, endsAt);
  // The window to hold a reminder for: null for none, and undefined while
  // entitlement and the account are still loading. Nothing is known about the
  // offer until then, and syncing "none" would cancel a reminder that turns
  // out to be wanted.
  const target: number | null | undefined =
    loading || userId === undefined
      ? undefined
      : !entitled && optedIn
        ? endsAt
        : null;

  useEffect(() => {
    if (userId) activeUserId = userId;
  }, [userId]);

  useEffect(() => {
    if (target === undefined) return;
    applyTarget(target).catch((error) =>
      analytics.captureError("exit_offer_reminder_failed", error),
    );
  }, [target]);
}
