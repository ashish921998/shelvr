import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement, useExitOfferEndsAt } from "@/lib/entitlement";
import { exitOfferReminderAt } from "@/lib/exit-offer";
import { t } from "@/lib/i18n";
import { canNotify, trialNudgesAllowed } from "@/lib/trial-reminder";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * One local notification an hour before the exit offer closes. It never asks
 * for permission, follows the Save reminders switch like the trial nudges,
 * and disappears with the offer: bought, expired, or signed out.
 */

export const EXIT_OFFER_REMINDER_ID = "shelvr.exit-offer-ending";
const CHANNEL_ID = "trial-reminder";

export async function syncExitOfferReminder(
  endsAt: number | null,
  now: number,
): Promise<boolean> {
  await Notifications.cancelScheduledNotificationAsync(EXIT_OFFER_REMINDER_ID);
  const fireAt = endsAt === null ? null : exitOfferReminderAt(endsAt, now);
  if (fireAt === null) return false;
  if (!canNotify(await Notifications.getPermissionsAsync())) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("notifications.trialChannel"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
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
  const preferences = useQuery({
    ...convexQuery(api.notifications.getPreferences, userId ? {} : "skip"),
  });
  const endsAt = useExitOfferEndsAt(userId);
  const allowed =
    preferences.data !== undefined && trialNudgesAllowed(preferences.data);
  const target = !loading && !entitled && allowed ? endsAt : null;

  useEffect(() => {
    // Wait for the switch before scheduling; cancelling needs no wait.
    if (target !== null && preferences.data === undefined) return;
    syncExitOfferReminder(target, Date.now()).catch((error) =>
      analytics.captureError("exit_offer_reminder_failed", error),
    );
  }, [target, preferences.data]);
}
