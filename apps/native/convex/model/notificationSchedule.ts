const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest IANA zone name is about 32 characters; this bounds untrusted input. */
const MAX_TIMEZONE_LENGTH = 64;

/**
 * True when `Intl` accepts `timezone` as a `timeZone` option. This is the only
 * check that matches what the scheduler does at run time: `Intl.supportedValuesOf`
 * returns a canonical-only list that omits `"UTC"`, aliases, and `Etc/GMT±N`, so it
 * would reject zones the formatter accepts.
 */
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

/**
 * Boundary check for a client-supplied zone. Returns the trimmed zone, or
 * `undefined` when none was supplied, and throws on anything `Intl` rejects so a
 * bad value is never persisted.
 */
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

/**
 * Resolves a stored zone to one `Intl` accepts. Stored rows may predate input
 * validation, so any invalid value falls back to UTC instead of throwing; a
 * digest must never fail forever because of one bad preference row.
 */
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

/**
 * The wall-clock formatter for a stored zone. Building the formatter is itself
 * the validity check, so a bad zone costs one failed construction instead of a
 * probe formatter plus the real one. Stored rows may predate input validation
 * and must never make a digest fail forever, so an invalid zone falls back to
 * UTC in the same way `resolveTimezone` does.
 */
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

export function nextWeeklyDigestAt(now: number, timezone = "UTC"): number {
  const formatter = wallClockFormatter(timezone);
  const localTimestamp = (instant: number) => {
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
  };
  const local = new Date(localTimestamp(now));
  local.setUTCHours(9, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + ((7 - local.getUTCDay()) % 7));
  for (let week = 0; week < 2; week++) {
    const wallTime = local.getTime() + week * 7 * DAY_MS;
    let instant = wallTime;
    for (let pass = 0; pass < 4; pass++) {
      instant += wallTime - localTimestamp(instant);
    }
    if (instant > now) return instant;
  }
  throw new Error("Could not calculate weekly notification time");
}
