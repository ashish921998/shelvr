import { t } from "@/lib/i18n";
import * as Notifications from "expo-notifications";

/**
 * The one reminder onboarding offers: bring back the first save at a time the
 * person picks. It is scheduled on the device, like the trial reminder, so it
 * needs no push token, no backend preference and no server-side switch.
 */

export const FIRST_SAVE_REMINDER_ID = "shelvr.first-save-reminder";
// The channel `ensureChannels` creates for save reminders, so the Android
// switch for reminders about saves covers this one too.
const CHANNEL_ID = "save-reminders";

const EVENING_HOUR = 20;
const WEEKEND_HOUR = 10;
const WEEKDAY_HOUR = 18;
const SUNDAY = 0;
const SATURDAY = 6;
const MONDAY = 1;
// "Tonight" needs at least this long before 8 pm to still mean tonight.
const TONIGHT_LEAD_MS = 60 * 60 * 1000;

export type ReminderSlot = "tonight" | "tomorrow" | "weekend" | "nextWeek";
type ReminderOption = { slot: ReminderSlot; at: Date };

function atHour(day: Date, hour: number): Date {
  const at = new Date(day);
  at.setHours(hour, 0, 0, 0);
  return at;
}

/** The first day after `day` that falls on `weekday`, at `hour`. */
function nextWeekday(day: Date, weekday: number, hour: number): Date {
  const at = atHour(day, hour);
  do at.setDate(at.getDate() + 1);
  while (at.getDay() !== weekday);
  return at;
}

/**
 * A morning in the current weekend (or the coming one, on a weekday) that
 * still lies after `after`. None once the weekend has nothing left: a later
 * Saturday would be next weekend, not this one.
 */
function thisWeekend(now: Date, after: Date): Date | undefined {
  const saturday =
    now.getDay() === SUNDAY
      ? atHour(addDays(now, -1), WEEKEND_HOUR)
      : now.getDay() === SATURDAY
        ? atHour(now, WEEKEND_HOUR)
        : nextWeekday(now, SATURDAY, WEEKEND_HOUR);
  return [saturday, addDays(saturday, 1)].find((at) => at > after);
}

/**
 * Up to three moments in local time, earliest first: this evening (or
 * tomorrow's, once it is too late), this weekend while some of it is left,
 * and Tuesday evening of next week. Each is worked out from what its label
 * means, so a label never names a different week.
 */
export function reminderOptions(now: Date): ReminderOption[] {
  const tonight = atHour(now, EVENING_HOUR);
  const first: ReminderOption =
    tonight.getTime() - now.getTime() >= TONIGHT_LEAD_MS
      ? { slot: "tonight", at: tonight }
      : { slot: "tomorrow", at: addDays(tonight, 1) };
  const weekend = thisWeekend(now, first.at);
  // Weeks start on Monday, so from a Sunday "next week" is the day after.
  const nextWeek = addDays(nextWeekday(now, MONDAY, WEEKDAY_HOUR), 1);

  return [
    first,
    ...(weekend ? [{ slot: "weekend" as const, at: weekend }] : []),
    { slot: "nextWeek", at: nextWeek },
  ];
}

function addDays(day: Date, days: number): Date {
  const at = new Date(day);
  at.setDate(at.getDate() + days);
  return at;
}

/**
 * Schedules (or replaces) the reminder for one save. The caller has already
 * got notification permission; without it nothing would be shown.
 */
export async function scheduleFirstSaveReminder({
  itemId,
  title,
  at,
}: {
  itemId: string;
  title: string;
  at: Date;
}): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(FIRST_SAVE_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: FIRST_SAVE_REMINDER_ID,
    content: {
      title: t("reminder.readTitle"),
      body: t("reminder.readBody", { title }),
      // `kind` and `notificationId` let `notification_opened` attribute the
      // tap, the same way the trial reminder and pushes carry theirs.
      data: {
        url: `/item/${itemId}`,
        kind: "first_save_reminder",
        notificationId: FIRST_SAVE_REMINDER_ID,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
}

/**
 * Drops the reminder, scheduled or already shown. It names a save, so it must
 * not outlive the account that made it.
 */
export async function clearFirstSaveReminder(): Promise<void> {
  // Settled independently: a failed cancel must not leave a delivered
  // reminder in the tray, and cleanup must never fail a sign-out.
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(FIRST_SAVE_REMINDER_ID),
    Notifications.dismissNotificationAsync(FIRST_SAVE_REMINDER_ID),
  ]);
}
