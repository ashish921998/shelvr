import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement, waitForSheetTransition } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * A local notification two days before a free trial renews. The yearly plan
 * charges on day 7 unless cancelled, and a reminder is what makes starting a
 * trial feel safe. It is scheduled on the device, so it works without the
 * weekly shelf opt-in or a push token, and it ships over the air.
 */

export const TRIAL_REMINDER_ID = "shelvr.trial-ending";
const CHANNEL_ID = "trial-reminder";
const LEAD_MS = 2 * 24 * 60 * 60 * 1000;
// A reminder due within this window is pointless: the trial ends first.
const MIN_LEAD_MS = 60 * 1000;

const askedKey = (userId: string) => `shelvr.trialReminderAsked.${userId}`;

/** When to remind, or null when the trial ends too soon for a reminder. */
export function trialReminderAt(expiresAt: number, now: number): number | null {
  const fireAt = expiresAt - LEAD_MS;
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}

function canNotify(permission: Notifications.NotificationPermissionsStatus) {
  if (Platform.OS !== "ios") return permission.granted;
  const status = permission.ios?.status;
  return (
    status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * Schedules (or replaces) the reminder for a trial ending at `expiresAt`.
 * Asks for notification permission only when `mayAsk` is set, which is the
 * moment a trial has just started. Returns whether a reminder is scheduled.
 * `isCurrent` turns false once the trial it was called for has ended or the
 * account changed, so a call left waiting on the permission prompt never
 * leaves a reminder behind.
 */
export async function scheduleTrialReminder(
  expiresAt: number,
  now: number,
  mayAsk: boolean,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const fireAt = trialReminderAt(expiresAt, now);
  if (fireAt === null) {
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    return false;
  }
  // Android 13 cannot request notification permission before a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("notifications.trialChannel"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!canNotify(permission) && mayAsk && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
    analytics.capture("trial_reminder_permission", {
      granted: canNotify(permission),
    });
  }
  if (!canNotify(permission) || !isCurrent()) return false;

  await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: TRIAL_REMINDER_ID,
    content: {
      title: t("notifications.trialEndingTitle"),
      body: t("notifications.trialEndingBody"),
      data: { url: "/profile" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
      channelId: CHANNEL_ID,
    },
  });
  if (!isCurrent()) {
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    return false;
  }
  return true;
}

async function cancelTrialReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  // A reminder already delivered is wrong once the trial converts or ends.
  await Notifications.dismissNotificationAsync(TRIAL_REMINDER_ID);
}

/**
 * Keeps the reminder in step with the entitlement. A trial that starts while
 * the app is open (the paywall just closed on a purchase) asks for
 * notification permission once per account. Trials already running only get
 * a reminder when permission was granted some other way, so nobody is asked
 * cold on launch. Anything other than a trial clears the reminder.
 */
export function useTrialReminder(): void {
  const { status, expiresAt, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  // The last settled status for this account, so a trial that begins while
  // the app is open can be told apart from one that was already running.
  const previous = useRef<{ userId: string; status: string } | null>(null);
  const scheduledFor = useRef<number | null>(null);
  // Bumped whenever the reminder should no longer exist, so scheduling work
  // still in flight from an earlier trial knows it is stale.
  const generation = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (status !== "trialing" || expiresAt === undefined) {
      scheduledFor.current = null;
      generation.current += 1;
      cancelTrialReminder().catch((error) =>
        analytics.captureError("trial_reminder_cancel_failed", error),
      );
    }
    if (userId === null) {
      previous.current = null;
      return;
    }
    const before =
      previous.current?.userId === userId ? previous.current.status : null;
    previous.current = { userId, status };
    if (status !== "trialing" || expiresAt === undefined) return;
    if (scheduledFor.current === expiresAt) return;

    const justStarted = before !== null && before !== "trialing";
    const mayAsk = justStarted && SecureStore.getItem(askedKey(userId)) !== "1";
    if (mayAsk) SecureStore.setItem(askedKey(userId), "1");

    scheduledFor.current = expiresAt;
    generation.current += 1;
    const mine = generation.current;
    const isCurrent = () => generation.current === mine;
    void (async () => {
      // The OS prompt cannot present over a closing RevenueCat sheet.
      if (mayAsk) await waitForSheetTransition();
      if (!isCurrent()) return;
      const scheduled = await scheduleTrialReminder(
        expiresAt,
        Date.now(),
        mayAsk,
        isCurrent,
      );
      if (!scheduled && isCurrent()) scheduledFor.current = null;
    })().catch((error) => {
      if (isCurrent()) scheduledFor.current = null;
      analytics.captureError("trial_reminder_schedule_failed", error);
    });
  }, [status, expiresAt, loading, userId]);
}
