import * as Notifications from "expo-notifications";

/** Older builds scheduled this reminder from onboarding; it is still cleared on sign-out. */
export const FIRST_SAVE_REMINDER_ID = "shelvr.first-save-reminder";

export async function clearFirstSaveReminder(): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(FIRST_SAVE_REMINDER_ID),
    Notifications.dismissNotificationAsync(FIRST_SAVE_REMINDER_ID),
  ]);
}
