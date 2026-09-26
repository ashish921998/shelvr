import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";

/**
 * The rules for a save reminder: one push that names one save and asks for
 * the thing the user saved it to do. Everything here is pure so the policy is
 * testable without a database; `convex/saveReminders.ts` does the reads.
 *
 * - `read`: an article the user has never opened. "X is ready when you are."
 * - `cook`: a recipe that has had time to be forgotten. "Want to make X today?"
 *
 * A save earns at most one reminder, ever. Anything that is not clearly an
 * article or a recipe gets none, because a vague "remember this?" is the
 * notification people turn off.
 */
export type ReminderKind = "read" | "cook";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** "You haven't read it" an hour after saving is nagging, not remembering. */
export const READ_MIN_AGE_MS = DAY_MS;
/** Past this an unread article is an intent the user has let go. */
export const READ_MAX_AGE_MS = 90 * DAY_MS;
/** A recipe resurfaces once it has had time to slip the user's mind. */
export const COOK_MIN_AGE_MS = 3 * DAY_MS;
/** A recipe opened this recently is already on the user's mind. */
export const COOK_RECENTLY_OPENED_MS = 7 * DAY_MS;

/**
 * Less than a day, so an hourly cron that runs a little earlier tomorrow than
 * today still lands a daily reminder, while two can never share one day.
 */
export const MIN_GAP_MS = 20 * HOUR_MS;
/** Every push this app sends counts, the weekly shelf included. */
export const WEEKLY_LIMIT = 4;
export const WEEK_MS = 7 * DAY_MS;
/** This many reminders in a row with the save left unopened... */
export const IGNORED_STREAK = 3;
/** ...slows reminders to one a week until the user opens one again. */
export const IGNORED_PAUSE_MS = WEEK_MS;

/**
 * A pass this late is not sent: it books the user's next slot instead. The
 * hourly cron is never more than an hour late, so this only catches a
 * backlog, such as every user armed while the server switch was off coming
 * due at once when it turns on, which would otherwise send at any hour.
 */
export const MAX_LATE_MS = 2 * HOUR_MS;

/** The server switch, `SAVE_REMINDERS_ENABLED`. Only "true" sends. */
export function saveRemindersLive(): boolean {
  return env.SAVE_REMINDERS_ENABLED === "true";
}

/** Used until the user has saved enough for their own hour to show. */
export const DEFAULT_REMINDER_HOUR = 18;
/** "Today" still means something at 19:00, and nothing lands before 10:00. */
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
  // `media` marks a social post and `enrichment` a page whose body could not
  // be read. Neither is something the user "hasn't read".
  if (
    item.type === "link" &&
    item.media === undefined &&
    item.enrichment === undefined &&
    (item.content?.trim().length ?? 0) > 0
  )
    return "read";
  return undefined;
}

/** What the notification calls the save: the dish for a recipe, else the title. */
export function reminderSubject(
  item: Doc<"items">,
  kind: ReminderKind,
): string | undefined {
  const subject =
    (kind === "cook" ? item.recipe?.name?.trim() : undefined) ||
    item.title?.trim();
  return subject || undefined;
}

export type ReminderCandidate = {
  item: Doc<"items">;
  kind: ReminderKind;
  subject: string;
};

/**
 * Saves that could be named, in the order to try them. Each list is newest
 * first, because the most recent intent is the one most likely still held.
 * The kind not sent last goes first, so a reading list and a recipe box take
 * turns instead of one crowding out the other.
 *
 * Read state and reminder history need database reads, so the caller checks
 * those while walking this list.
 */
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

/** Whether the user's opens rule a candidate out. */
export function openedTooRecently(
  kind: ReminderKind,
  lastOpenedAt: number | undefined,
  now: number,
): boolean {
  if (lastOpenedAt === undefined) return false;
  // An opened article has been read, as far as anyone can know. A recipe is
  // cooked more than once, so only a recent look rules it out.
  return kind === "read" || now - lastOpenedAt < COOK_RECENTLY_OPENED_MS;
}

export type BudgetBlock = "too_soon" | "weekly_limit" | "ignored";

/**
 * Why no reminder may go out now, or `undefined` when one may.
 *
 * `sentAt` holds when every push of the past week went out, of any kind.
 * `recentReminders` is the user's latest reminders, newest first, each marked
 * with whether its save was opened after it was sent.
 *
 * `shelf` is the user's weekly shelf, when it is on. The shelf is never held
 * back for a reminder: it is opt-in and weekly, so skipping it would cost a
 * whole week. Reminders make room for it instead, so the day and week limits
 * hold across both kinds: none goes out within `MIN_GAP_MS` before the shelf
 * is due, and until a shelf has gone out in the past week one weekly slot is
 * kept for it.
 */
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
  if (
    streak.length === IGNORED_STREAK &&
    streak.every((reminder) => !reminder.opened) &&
    now - streak[0].createdAt < IGNORED_PAUSE_MS
  )
    return "ignored";
  return undefined;
}

/**
 * The local hour the user saves at most, which is when they are on their
 * phone and in a saving mood. Most saves arrive from the share sheet while
 * the user is scrolling another app, so this is the closest honest proxy for
 * "while they are scrolling" that needs no tracking. Ties go to the hour
 * nearest the default; the result is clamped to daytime.
 */
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
