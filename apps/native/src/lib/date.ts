import { formattingLocale } from "./i18n";

/**
 * Reads the original capture time from an image picker asset's EXIF data.
 * EXIF `DateTimeOriginal` is formatted `"YYYY:MM:DD HH:MM:SS"` (colons in the
 * date portion), which `Date.parse` won't accept — swap the first two colons
 * for dashes first. Returns epoch ms, or `undefined` if the tag is missing or
 * unparseable.
 */
export function parseExifDate(
  exif: Record<string, unknown> | null | undefined,
): number | undefined {
  const raw = exif?.DateTimeOriginal;
  if (typeof raw !== "string") return undefined;
  const iso = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Formats an epoch-ms timestamp as a short display date, e.g. "Jul 5, 2026". */
export function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A free trial's length as the store reports it: `unit` is DAY, WEEK, MONTH
 * or YEAR. */
export type TrialPeriod = { unit: string; count: number };

/**
 * Dates and day numbers for the paywall's trial timeline, filled into its
 * `{{ custom.* }}` labels ("Day 5 · Oct 7"). `trial` is the offer's own
 * length, so both follow it; the reminder is two days before the end, as in
 * `trial-reminder.ts`. The dashboard defaults are empty dates and the day
 * numbers of a seven-day trial, so a build that passes nothing shows the bare
 * labels; the caller does the same when the offer's length is unknown.
 * `trial_day5` and `trial_day7` keep the names the dashboard already
 * references: they are the reminder and end dates.
 */
export function trialTimelineVariables(now: number, trial: TrialPeriod) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  const months =
    trial.unit === "YEAR"
      ? trial.count * 12
      : trial.unit === "MONTH"
        ? trial.count
        : 0;
  if (months > 0) {
    // Jan 31 plus a month is the last day of February, not a date in March.
    end.setDate(1);
    end.setMonth(end.getMonth() + months);
    const lastDay = new Date(
      end.getFullYear(),
      end.getMonth() + 1,
      0,
    ).getDate();
    end.setDate(Math.min(start.getDate(), lastDay));
  } else {
    end.setDate(end.getDate() + trial.count * (trial.unit === "WEEK" ? 7 : 1));
  }
  const remind = new Date(end);
  remind.setDate(remind.getDate() - 2);
  const label = (date: Date) =>
    date.toLocaleDateString(formattingLocale(), {
      month: "short",
      day: "numeric",
    });
  // Rounded, so a daylight saving change inside the trial cannot shift a day.
  const dayNumber = (date: Date) =>
    String(Math.round((date.getTime() - start.getTime()) / 86_400_000));
  const string = (value: string) => ({ type: "string", value }) as const;
  return {
    trial_today: string(` · ${label(start)}`),
    trial_day5: string(` · ${label(remind)}`),
    trial_day7: string(` · ${label(end)}`),
    trial_remind_date: string(label(remind)),
    trial_remind_day: string(dayNumber(remind)),
    trial_end_day: string(dayNumber(end)),
  };
}
