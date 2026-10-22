import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";

type ReminderKind = "read" | "cook";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const READ_MIN_AGE_MS = DAY_MS;
export const READ_MAX_AGE_MS = 90 * DAY_MS;
export const COOK_MIN_AGE_MS = 3 * DAY_MS;
const COOK_RECENTLY_OPENED_MS = 7 * DAY_MS;

export const MIN_GAP_MS = 20 * HOUR_MS;
export const WEEKLY_LIMIT = 4;
export const WEEK_MS = 7 * DAY_MS;
export const IGNORED_STREAK = 3;
const IGNORED_PAUSE_MS = WEEK_MS;

export const MAX_LATE_MS = 2 * HOUR_MS;

export function saveRemindersLive(): boolean {
  return env.SAVE_REMINDERS_ENABLED === "true";
}

export const DEFAULT_REMINDER_HOUR = 18;

export function remindersOn(preferences: {
  remindersEnabled?: boolean;
}): boolean {
  return preferences.remindersEnabled !== false;
}

const EARLIEST_HOUR = 10;
const LATEST_HOUR = 19;
const MIN_HOUR_SAMPLES = 5;
export const HOUR_SAMPLE_WINDOW_MS = 30 * DAY_MS;

export function reminderKind(item: Doc<"items">): ReminderKind | undefined {
  if (item.status !== "ready") return undefined;
  if (
    item.recipe !== undefined &&
    (item.recipe.ingredients.length > 0 || item.recipe.steps.length > 0)
  )
    return "cook";
  if (
    item.type === "link" &&
    item.media === undefined &&
    item.enrichment === undefined &&
    (item.content?.trim().length ?? 0) > 0
  )
    return "read";
  return undefined;
}

export function reminderSubject(
  item: Doc<"items">,
  kind: ReminderKind,
): string | undefined {
  const subject =
    (kind === "cook" ? item.recipe?.name?.trim() : undefined) ||
    item.title?.trim();
  return subject || undefined;
}

type ReminderCandidate = {
  item: Doc<"items">;
  kind: ReminderKind;
  subject: string;
};

export function reminderCandidates(
  newestFirst: readonly Doc<"items">[],
  now: number,
  previousKind: ReminderKind | undefined,
): ReminderCandidate[] {
  const read: ReminderCandidate[] = [];
  const cook: ReminderCandidate[] = [];
  for (const item of newestFirst) {
    const kind = reminderKind(item);
    if (kind === undefined) continue;
    const subject = reminderSubject(item, kind);
    if (subject === undefined) continue;
    const age = now - item._creationTime;
    if (kind === "read" && age >= READ_MIN_AGE_MS && age <= READ_MAX_AGE_MS)
      read.push({ item, kind, subject });
    if (kind === "cook" && age >= COOK_MIN_AGE_MS)
      cook.push({ item, kind, subject });
  }
  return previousKind === "read" ? [...cook, ...read] : [...read, ...cook];
}

export function openedTooRecently(
  kind: ReminderKind,
  lastOpenedAt: number | undefined,
  now: number,
): boolean {
  if (lastOpenedAt === undefined) return false;
  return kind === "read" || now - lastOpenedAt < COOK_RECENTLY_OPENED_MS;
}

type BudgetBlock = "too_soon" | "weekly_limit" | "ignored";

export function reminderBlocked(
  now: number,
  sentAt: readonly number[],
  recentReminders: readonly { createdAt: number; opened: boolean }[],
  shelf?: { nextAt: number; sentThisWeek: boolean },
): BudgetBlock | undefined {
  if (
    sentAt.some((at) => now - at < MIN_GAP_MS) ||
    (shelf !== undefined && shelf.nextAt - now < MIN_GAP_MS)
  )
    return "too_soon";
  const kept = shelf !== undefined && !shelf.sentThisWeek ? 1 : 0;
  if (sentAt.filter((at) => now - at < WEEK_MS).length + kept >= WEEKLY_LIMIT)
    return "weekly_limit";
  const streak = recentReminders.slice(0, IGNORED_STREAK);
  const [latest] = streak;
  if (
    latest !== undefined &&
    streak.length === IGNORED_STREAK &&
    streak.every((reminder) => !reminder.opened) &&
    now - latest.createdAt < IGNORED_PAUSE_MS
  )
    return "ignored";
  return undefined;
}

export function preferredReminderHour(localHours: readonly number[]): number {
  if (localHours.length < MIN_HOUR_SAMPLES) return DEFAULT_REMINDER_HOUR;
  const counts = new Map<number, number>();
  for (const hour of localHours) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  let best = DEFAULT_REMINDER_HOUR;
  let bestCount = 0;
  for (const [hour, count] of counts) {
    const closer =
      Math.abs(hour - DEFAULT_REMINDER_HOUR) <
      Math.abs(best - DEFAULT_REMINDER_HOUR);
    if (count > bestCount || (count === bestCount && closer)) {
      best = hour;
      bestCount = count;
    }
  }
  return Math.min(LATEST_HOUR, Math.max(EARLIEST_HOUR, best));
}
