const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_TIMEZONE_LENGTH = 64;

export function isValidTimezone(timezone: string): boolean {
  if (timezone.length === 0 || timezone.length > MAX_TIMEZONE_LENGTH) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function parseTimezoneInput(
  timezone: string | undefined,
): string | undefined {
  if (timezone === undefined) return undefined;
  const trimmed = timezone.trim();
  if (!isValidTimezone(trimmed)) {
    throw new Error("Invalid timezone: expected an IANA zone such as UTC");
  }
  return trimmed;
}

export function resolveTimezone(timezone: string | undefined): string {
  return timezone !== undefined && isValidTimezone(timezone) ? timezone : "UTC";
}

const WALL_CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

function wallClockFormatter(timezone: string | undefined): Intl.DateTimeFormat {
  if (timezone !== undefined && timezone.length <= MAX_TIMEZONE_LENGTH) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...WALL_CLOCK_FORMAT,
        timeZone: timezone,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return new Intl.DateTimeFormat("en-US", {
    ...WALL_CLOCK_FORMAT,
    timeZone: "UTC",
  });
}

function localTimestamp(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
}

function instantAt(formatter: Intl.DateTimeFormat, wallTime: number) {
  let instant = wallTime;
  for (let pass = 0; pass < 4; pass++) {
    instant += wallTime - localTimestamp(formatter, instant);
  }
  return instant;
}

export function nextWeeklyDigestAt(now: number, timezone = "UTC"): number {
  const formatter = wallClockFormatter(timezone);
  const local = new Date(localTimestamp(formatter, now));
  local.setUTCHours(9, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + ((7 - local.getUTCDay()) % 7));
  for (let week = 0; week < 2; week++) {
    const instant = instantAt(formatter, local.getTime() + week * 7 * DAY_MS);
    if (instant > now) return instant;
  }
  throw new Error("Could not calculate weekly notification time");
}

export function localHour(instant: number, timezone?: string): number {
  return new Date(
    localTimestamp(wallClockFormatter(timezone), instant),
  ).getUTCHours();
}

export function nextLocalHourAt(
  now: number,
  timezone: string | undefined,
  hour: number,
): number {
  const formatter = wallClockFormatter(timezone);
  const local = new Date(localTimestamp(formatter, now));
  local.setUTCHours(hour, 0, 0, 0);
  for (let day = 0; day < 3; day++) {
    const instant = instantAt(formatter, local.getTime() + day * DAY_MS);
    if (instant > now) return instant;
  }
  throw new Error("Could not calculate daily notification time");
}

export function localHourOnDayAt(
  date: string,
  dayOffset: number,
  hour: number,
  timezone: string | undefined,
): number {
  const [year, month, day] = date.split("-").map(Number);
  return instantAt(
    wallClockFormatter(timezone),
    Date.UTC(year, month - 1, day + dayOffset, hour),
  );
}

export function rebookedSchedule(
  existing: { timezone?: string },
  timezone: string,
  now: number,
  reminderHour: number | null,
):
  | { timezone: string; nextDigestAt: number; nextReminderAt?: number }
  | undefined {
  if (timezone === existing.timezone) return undefined;
  return {
    timezone,
    nextDigestAt: nextWeeklyDigestAt(now, timezone),
    ...(reminderHour === null
      ? {}
      : { nextReminderAt: nextLocalHourAt(now, timezone, reminderHour) }),
  };
}
