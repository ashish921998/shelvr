import { t } from "@/lib/i18n";
import * as Notifications from "expo-notifications";

export const FIRST_SAVE_REMINDER_ID = "shelvr.first-save-reminder";
const CHANNEL_ID = "save-reminders";

const EVENING_HOUR = 20;
const WEEKEND_HOUR = 10;
const WEEKDAY_HOUR = 18;
const SUNDAY = 0;
const SATURDAY = 6;
const MONDAY = 1;
const TONIGHT_LEAD_MS = 60 * 60 * 1000;

export type ReminderSlot = "tonight" | "tomorrow" | "weekend" | "nextWeek";
type ReminderOption = { slot: ReminderSlot; at: Date };

function atHour(day: Date, hour: number): Date {
  const at = new Date(day);
  at.setHours(hour, 0, 0, 0);
  return at;
}

function nextWeekday(day: Date, weekday: number, hour: number): Date {
  const at = atHour(day, hour);
  do at.setDate(at.getDate() + 1);
  while (at.getDay() !== weekday);
  return at;
}

function thisWeekend(now: Date, after: Date): Date | undefined {
  const saturday =
    now.getDay() === SUNDAY
      ? atHour(addDays(now, -1), WEEKEND_HOUR)
      : now.getDay() === SATURDAY
        ? atHour(now, WEEKEND_HOUR)
        : nextWeekday(now, SATURDAY, WEEKEND_HOUR);
  return [saturday, addDays(saturday, 1)].find((at) => at > after);
}

export function reminderOptions(now: Date): ReminderOption[] {
  const tonight = atHour(now, EVENING_HOUR);
  const first: ReminderOption =
    tonight.getTime() - now.getTime() >= TONIGHT_LEAD_MS
      ? { slot: "tonight", at: tonight }
      : { slot: "tomorrow", at: addDays(tonight, 1) };
  const weekend = thisWeekend(now, first.at);
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

let generation = 0;

let tail: Promise<unknown> = Promise.resolve();
function serial(task: () => Promise<void>): Promise<void> {
  const run = tail.then(task, task);
  tail = run.catch(() => {});
  return run;
}

export function firstSaveReminderTicket(): number {
  return generation;
}

export function scheduleFirstSaveReminder({
  itemId,
  title,
  at,
  ticket = generation,
}: {
  itemId: string;
  title: string;
  at: Date;
  ticket?: number;
}): Promise<void> {
  return serial(async () => {
    if (ticket !== generation) return;
    await Notifications.cancelScheduledNotificationAsync(
      FIRST_SAVE_REMINDER_ID,
    );
    await Notifications.scheduleNotificationAsync({
      identifier: FIRST_SAVE_REMINDER_ID,
      content: {
        title: t("reminder.readTitle"),
        body: t("reminder.readBody", { title }),
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
  });
}

export function clearFirstSaveReminder(): Promise<void> {
  generation += 1;
  return serial(async () => {
    await Promise.allSettled([
      Notifications.cancelScheduledNotificationAsync(FIRST_SAVE_REMINDER_ID),
      Notifications.dismissNotificationAsync(FIRST_SAVE_REMINDER_ID),
    ]);
  });
}
