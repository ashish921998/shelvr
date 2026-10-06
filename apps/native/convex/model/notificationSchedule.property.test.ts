import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  localHour,
  nextLocalHourAt,
  nextWeeklyDigestAt,
} from "./notificationSchedule";

const DAY_MS = 24 * 60 * 60 * 1000;

// Zones with DST in each hemisphere, half-hour and 45-minute offsets, and
// both sides of the date line.
const ZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Adelaide",
  "Australia/Lord_Howe",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
];

const zone = fc.constantFrom(...ZONES);
// 2024 through 2030, plus the eight days before each 2026 DST change (US, EU,
// southern hemisphere), where a schedule is most likely to slip an hour.
const DST_CHANGES_2026 = [
  "2026-03-08",
  "2026-03-29",
  "2026-04-05",
  "2026-10-04",
  "2026-10-25",
  "2026-11-01",
].map((day) => Date.parse(`${day}T12:00:00Z`));
const instant = fc.oneof(
  fc.integer({ min: 1_704_067_200_000, max: 1_924_992_000_000 }),
  fc
    .tuple(
      fc.constantFrom(...DST_CHANGES_2026),
      fc.integer({ min: 0, max: 8 * DAY_MS }),
    )
    .map(([change, before]) => change - before),
);

const weekday = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);

describe("weekly shelf schedule", () => {
  it("is always in the future, within a week, at 9:00 on a Sunday local time", () => {
    fc.assert(
      fc.property(instant, zone, (now, tz) => {
        const at = nextWeeklyDigestAt(now, tz);
        expect(at).toBeGreaterThan(now);
        // A week plus the longest DST shift.
        expect(at - now).toBeLessThanOrEqual(7 * DAY_MS + 2 * 60 * 60 * 1000);
        expect(localHour(at, tz)).toBe(9);
        expect(weekday(at, tz)).toBe("Sun");
      }),
    );
  });
});

describe("daily reminder slot", () => {
  it("is always the next daytime hour asked for, never in the past", () => {
    fc.assert(
      fc.property(
        instant,
        zone,
        fc.integer({ min: 10, max: 19 }),
        (now, tz, hour) => {
          const at = nextLocalHourAt(now, tz, hour);
          expect(at).toBeGreaterThan(now);
          expect(at - now).toBeLessThanOrEqual(DAY_MS + 2 * 60 * 60 * 1000);
          expect(localHour(at, tz)).toBe(hour);
        },
      ),
    );
  });
});
