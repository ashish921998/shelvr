const DAY_MS = 24 * 60 * 60 * 1000;

export function nextWeeklyDigestAt(now: number, timezone = "UTC"): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
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
