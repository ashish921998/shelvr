import { formattingLocale } from "./i18n";

export function parseExifDate(
  exif: Record<string, unknown> | null | undefined,
): number | undefined {
  const raw = exif?.DateTimeOriginal;
  if (typeof raw !== "string") return undefined;
  const iso = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

export function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRecentDate(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const thisYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

export type TrialPeriod = { unit: string; count: number };

/** `remindAt` is when the trial reminder fires for a trial ending at `end`. */
export function trialTimelineVariables(
  now: number,
  trial: TrialPeriod,
  remindAt: (end: number) => number | null = (end) => end - 2 * 86_400_000,
) {
  const dayMs = 86_400_000;
  const start = new Date(now);
  let end = new Date(now);
  const months =
    trial.unit === "YEAR"
      ? trial.count * 12
      : trial.unit === "MONTH"
        ? trial.count
        : 0;
  if (months > 0) {
    end.setDate(1);
    end.setMonth(end.getMonth() + months);
    const lastDay = new Date(
      end.getFullYear(),
      end.getMonth() + 1,
      0,
    ).getDate();
    end.setDate(Math.min(start.getDate(), lastDay));
  } else {
    end = new Date(now + trial.count * (trial.unit === "WEEK" ? 7 : 1) * dayMs);
  }
  const remind = new Date(remindAt(end.getTime()) ?? end.getTime() - 2 * dayMs);
  const label = (date: Date) =>
    date.toLocaleDateString(formattingLocale(), {
      month: "short",
      day: "numeric",
    });
  const dayNumber = (date: Date) =>
    String(Math.round((date.getTime() - now) / dayMs));
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
