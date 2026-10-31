import { describe, expect, it } from "vitest";
import { reminderBlocked } from "./saveReminders";
import {
  nextTripEveAt,
  savedStopCount,
  tripEveAt,
  tripEveDateRange,
  tripEveDue,
} from "./tripEve";

const HOUR = 60 * 60 * 1000;
const at = (iso: string) => Date.parse(iso);

describe("tripEveAt", () => {
  it.each([
    ["2026-09-26", "UTC", "2026-09-25T18:00:00Z"],
    ["2026-03-01", "UTC", "2026-02-28T18:00:00Z"],
    ["2027-01-01", "UTC", "2026-12-31T18:00:00Z"],
    ["2026-09-26", "Asia/Kolkata", "2026-09-25T12:30:00Z"],
    ["2026-09-26", "Asia/Kathmandu", "2026-09-25T12:15:00Z"],
    ["2026-03-08", "America/New_York", "2026-03-07T23:00:00Z"],
    ["2026-03-09", "America/New_York", "2026-03-08T22:00:00Z"],
    ["2026-11-01", "America/New_York", "2026-10-31T22:00:00Z"],
    ["2026-11-02", "America/New_York", "2026-11-01T23:00:00Z"],
    ["2026-10-04", "Australia/Lord_Howe", "2026-10-03T07:30:00Z"],
    ["2026-10-05", "Australia/Lord_Howe", "2026-10-04T07:00:00Z"],
    ["2026-09-26", "Pacific/Kiritimati", "2026-09-25T04:00:00Z"],
    ["2026-09-26", undefined, "2026-09-25T18:00:00Z"],
    ["2026-09-26", "Not/AZone", "2026-09-25T18:00:00Z"],
  ])("%s in %s is %s", (startDate, timezone, expected) => {
    expect(tripEveAt(startDate, timezone)).toBe(at(expected));
  });
});

describe("tripEveDue", () => {
  const eve = at("2026-09-25T12:30:00Z");
  const trip = { startDate: "2026-09-26", _creationTime: eve - 3 * HOUR };

  it("opens at 18:00 local and closes two hours later", () => {
    expect(tripEveDue(trip, "Asia/Kolkata", eve - 1)).toBe(false);
    expect(tripEveDue(trip, "Asia/Kolkata", eve)).toBe(true);
    expect(tripEveDue(trip, "Asia/Kolkata", eve + 2 * HOUR - 1)).toBe(true);
    expect(tripEveDue(trip, "Asia/Kolkata", eve + 2 * HOUR)).toBe(false);
  });

  it("skips a trip made after its eve, or without a date", () => {
    expect(
      tripEveDue({ ...trip, _creationTime: eve }, "Asia/Kolkata", eve),
    ).toBe(false);
    expect(
      tripEveDue({ ...trip, startDate: undefined }, "Asia/Kolkata", eve),
    ).toBe(false);
  });
});

describe("tripEveDateRange", () => {
  it("runs from UTC yesterday to two days ahead", () => {
    expect(tripEveDateRange(at("2026-09-25T18:00:00Z"))).toEqual({
      from: "2026-09-24",
      to: "2026-09-27",
    });
  });
});

describe("savedStopCount", () => {
  it("counts saved and list stops on a planned day", () => {
    expect(
      savedStopCount([
        { day: 1, source: "save" },
        { day: 2, source: "list" },
        { day: 1, source: "suggested" },
        { day: 1, source: "added" },
        { day: 0, source: "save" },
      ]),
    ).toBe(2);
  });
});

describe("nextTripEveAt and the reminder budget", () => {
  const now = at("2026-09-25T00:00:00Z");
  const created = now - 24 * HOUR;

  it("finds the earliest eve still to come, ignoring dead ones", () => {
    expect(
      nextTripEveAt(
        [
          { startDate: "2026-09-28", _creationTime: created },
          { startDate: "2026-09-26", _creationTime: created },
          { startDate: "2026-09-24", _creationTime: created },
          { startDate: undefined, _creationTime: created },
          { startDate: "2026-09-25", _creationTime: now },
        ],
        "UTC",
        now,
      ),
    ).toBe(at("2026-09-25T18:00:00Z"));
    expect(nextTripEveAt([], "UTC", now)).toBeUndefined();
  });

  it("holds a save reminder from 20 hours before an eve until it has passed", () => {
    const eve = at("2026-09-25T18:00:00Z");
    expect(reminderBlocked(eve - 19 * HOUR, [], [], undefined, eve)).toBe(
      "too_soon",
    );
    expect(reminderBlocked(eve + HOUR, [], [], undefined, eve)).toBe(
      "too_soon",
    );
    expect(
      reminderBlocked(eve - 21 * HOUR, [], [], undefined, eve),
    ).toBeUndefined();
    expect(reminderBlocked(eve, [], [], undefined, undefined)).toBeUndefined();
  });
});
