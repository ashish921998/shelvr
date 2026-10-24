import * as SecureStore from "expo-secure-store";

export const RENEWAL_WINDOW_MS = 25 * 60 * 60 * 1000;
export const MIN_LEAD_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const BILLING_EARLIEST_HOUR = 9;
const BILLING_LATEST_HOUR = 20;

/** How many days before the trial ends the reminder comes; onboarding asks. */
export const TRIAL_REMINDER_LEAD_DAYS = [1, 2, 3] as const;
export type TrialReminderLeadDays = (typeof TRIAL_REMINDER_LEAD_DAYS)[number];
const DEFAULT_LEAD_DAYS: TrialReminderLeadDays = 2;
const LEAD_DAYS_KEY = "shelvr.trialReminderLeadDays";

export function setTrialReminderLeadDays(days: TrialReminderLeadDays): void {
  SecureStore.setItem(LEAD_DAYS_KEY, String(days));
}

export function trialReminderLeadDays(): TrialReminderLeadDays {
  const stored = Number(SecureStore.getItem(LEAD_DAYS_KEY));
  return (
    TRIAL_REMINDER_LEAD_DAYS.find((days) => days === stored) ??
    DEFAULT_LEAD_DAYS
  );
}

export function trialReminderAt(
  expiresAt: number,
  now: number,
  leadDays: TrialReminderLeadDays = DEFAULT_LEAD_DAYS,
): number | null {
  // A day's lead keeps the renewal window's extra hour, so it lands before
  // the cancellation cutoff rather than on it.
  const leadMs = leadDays === 1 ? RENEWAL_WINDOW_MS : leadDays * DAY_MS;
  const at = new Date(expiresAt - leadMs);
  // A billing warning may come early but never late, so night moves back to 8 pm.
  const hour = at.getHours();
  if (hour < BILLING_EARLIEST_HOUR) at.setDate(at.getDate() - 1);
  if (hour < BILLING_EARLIEST_HOUR || hour >= BILLING_LATEST_HOUR)
    at.setHours(BILLING_LATEST_HOUR, 0, 0, 0);
  const fireAt = at.getTime();
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}
