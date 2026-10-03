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

/**
 * Dates for the paywall's trial timeline, filled into its `{{ custom.* }}`
 * labels ("Today · Oct 2"). The dashboard defaults are empty, so a build that
 * passes nothing shows the bare labels.
 */
export function trialTimelineVariables(now: number = Date.now()) {
  const day = (offset: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString(formattingLocale(), {
      month: "short",
      day: "numeric",
    });
  };
  const string = (value: string) => ({ type: "string", value }) as const;
  return {
    trial_today: string(` · ${day(0)}`),
    trial_day5: string(` · ${day(5)}`),
    trial_day7: string(` · ${day(7)}`),
    trial_remind_date: string(day(5)),
  };
}
