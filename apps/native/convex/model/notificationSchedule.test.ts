import { describe, expect, it } from "vitest";
import { nextWeeklyDigestAt } from "./notificationSchedule";

describe("Sunday 09:00 schedule", () => {
  it.each([
    ["2026-03-01T14:00:00Z", "America/New_York", "2026-03-08T13:00:00Z"],
    ["2026-10-25T13:00:00Z", "America/New_York", "2026-11-01T14:00:00Z"],
    ["2026-09-05T23:00:00Z", "Asia/Kolkata", "2026-09-06T03:30:00Z"],
    ["2026-09-06T03:30:00Z", "Asia/Kolkata", "2026-09-13T03:30:00Z"],
    ["2026-09-05T22:00:00Z", "Pacific/Auckland", "2026-09-12T21:00:00Z"],
    ["2026-09-06T08:59:59Z", "UTC", "2026-09-06T09:00:00Z"],
  ])("%s in %s schedules %s", (now, zone, expected) => {
    expect(
      new Date(nextWeeklyDigestAt(Date.parse(now), zone)).toISOString(),
    ).toBe(new Date(expected).toISOString());
  });
});
