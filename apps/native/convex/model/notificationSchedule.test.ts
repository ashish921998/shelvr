import { describe, expect, it } from "vitest";
import {
  isValidTimezone,
  nextWeeklyDigestAt,
  parseTimezoneInput,
  resolveTimezone,
} from "./notificationSchedule";

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

  it("falls back to UTC for a stored zone Intl rejects instead of throwing", () => {
    const now = Date.parse("2026-09-06T08:59:59Z");
    const utc = nextWeeklyDigestAt(now, "UTC");
    expect(nextWeeklyDigestAt(now, "Mars/Olympus_Mons")).toBe(utc);
    expect(nextWeeklyDigestAt(now, "")).toBe(utc);
    expect(nextWeeklyDigestAt(now, "a".repeat(65))).toBe(utc);
    expect(nextWeeklyDigestAt(now, undefined)).toBe(utc);
  });
});

describe("timezone validation", () => {
  it.each(["UTC", "America/New_York", "Asia/Kolkata", "Etc/GMT+5"])(
    "accepts %s",
    (zone) => {
      expect(isValidTimezone(zone)).toBe(true);
      expect(parseTimezoneInput(zone)).toBe(zone);
      expect(resolveTimezone(zone)).toBe(zone);
    },
  );

  it.each(["", " ", "Mars/Olympus_Mons", "GMT+25:00", "a".repeat(65)])(
    "rejects %j at the boundary and resolves it to UTC when stored",
    (zone) => {
      expect(isValidTimezone(zone)).toBe(false);
      expect(() => parseTimezoneInput(zone)).toThrow("Invalid timezone");
      expect(resolveTimezone(zone)).toBe("UTC");
    },
  );

  it("passes through an absent zone and trims a present one", () => {
    expect(parseTimezoneInput(undefined)).toBeUndefined();
    expect(parseTimezoneInput("  Europe/Paris ")).toBe("Europe/Paris");
    expect(resolveTimezone(undefined)).toBe("UTC");
  });
});
