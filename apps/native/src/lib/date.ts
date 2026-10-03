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
 * Dates for the paywall's trial timeline, filled into its `{{ custom.* }}`
 * labels ("Today · Oct 2"). The dashboard defaults are empty, so a build that
 * passes nothing shows the bare labels. `trial` is the offer's own length, so
 * the dates follow it; the reminder is two days before the end, as in
 * `trial-reminder.ts`. The variable names keep the seven-day wording the
 * dashboard already references.
 */
export function trialTimelineVariables(
  now: number = Date.now(),
  trial: TrialPeriod = { unit: "DAY", count: 7 },
) {
  const end = new Date(now);
  if (trial.unit === "YEAR") end.setFullYear(end.getFullYear() + trial.count);
  else if (trial.unit === "MONTH") end.setMonth(end.getMonth() + trial.count);
  else
    end.setDate(end.getDate() + trial.count * (trial.unit === "WEEK" ? 7 : 1));
  const day = (from: Date, offset: number) => {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString(formattingLocale(), {
      month: "short",
      day: "numeric",
    });
  };
  const string = (value: string) => ({ type: "string", value }) as const;
  return {
    trial_today: string(` · ${day(new Date(now), 0)}`),
    trial_day5: string(` · ${day(end, -2)}`),
    trial_day7: string(` · ${day(end, 0)}`),
    trial_remind_date: string(day(end, -2)),
  };
}
