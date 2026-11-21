import { describe, expect, it, vi } from "vitest";

import {
  type CountdownTrip,
  countdownPhase,
  countdownTimeline,
  daysBetween,
  nextTrip,
  TIMELINE_DAYS,
  timelineTrips,
} from "./trip-countdown";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function trip(overrides: Partial<CountdownTrip> = {}): CountdownTrip {
  return {
    _id: "trip1" as CountdownTrip["_id"],
    city: "Lisbon",
    startDate: "2026-12-10",
    dayCount: 3,
    stopCount: 8,
    savedCount: 5,
    createdAt: 0,
    ...overrides,
  };
}

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);
const photo = () => "file:///w/lisbon.jpg";

describe("daysBetween", () => {
  it("counts calendar days, whatever the hour", () => {
    expect(daysBetween(at(2026, 12, 1, 23), at(2026, 12, 2, 0))).toBe(1);
    expect(daysBetween(at(2026, 12, 1, 0), at(2026, 12, 1, 23))).toBe(0);
  });

  it("is not thrown by a daylight-saving change", () => {
    expect(daysBetween(at(2026, 3, 28), at(2026, 3, 30))).toBe(2);
    expect(daysBetween(at(2026, 10, 24), at(2026, 10, 26))).toBe(2);
  });
});

describe("countdownPhase", () => {
  const lisbon = trip();

  it("counts down to the first day", () => {
    expect(countdownPhase(lisbon, at(2026, 11, 28))).toEqual({
      kind: "countdown",
      days: 12,
    });
    expect(countdownPhase(lisbon, at(2026, 12, 9))).toEqual({
      kind: "tomorrow",
    });
  });

  it("names the day during the trip and ends after its last day", () => {
    expect(countdownPhase(lisbon, at(2026, 12, 10))).toEqual({
      kind: "during",
      day: 1,
    });
    expect(countdownPhase(lisbon, at(2026, 12, 12))).toEqual({
      kind: "during",
      day: 3,
    });
    expect(countdownPhase(lisbon, at(2026, 12, 13))).toEqual({ kind: "over" });
  });

  it("treats a trip without a date as over", () => {
    expect(
      countdownPhase(trip({ startDate: undefined }), at(2026, 1, 1)),
    ).toEqual({ kind: "over" });
  });
});

describe("nextTrip", () => {
  const today = at(2026, 12, 11);

  it("picks the soonest trip that has not ended, including one under way", () => {
    const past = trip({
      _id: "past" as CountdownTrip["_id"],
      startDate: "2026-12-01",
    });
    const now = trip({
      _id: "now" as CountdownTrip["_id"],
      startDate: "2026-12-10",
    });
    const later = trip({
      _id: "later" as CountdownTrip["_id"],
      startDate: "2027-01-05",
    });
    const undated = trip({
      _id: "undated" as CountdownTrip["_id"],
      startDate: undefined,
    });
    expect(nextTrip([later, undated, past, now], today)?._id).toBe("now");
  });

  it("prefers the newest plan when two start the same day", () => {
    const older = trip({ _id: "older" as CountdownTrip["_id"], createdAt: 1 });
    const newer = trip({ _id: "newer" as CountdownTrip["_id"], createdAt: 2 });
    expect(nextTrip([older, newer], at(2026, 12, 1))?._id).toBe("newer");
  });

  it("returns null when nothing dated is ahead", () => {
    expect(nextTrip([trip({ startDate: "2026-01-01" })], today)).toBeNull();
    expect(nextTrip([], today)).toBeNull();
  });
});

describe("countdownTimeline", () => {
  it("shows the empty state when there is no trip", () => {
    const [entry, ...rest] = countdownTimeline(
      [],
      at(2026, 12, 1),
      "shelvr",
      photo,
    );
    expect(rest).toHaveLength(0);
    expect(entry.props.tripId).toBeUndefined();
    expect(entry.props.emptyTitle).toBe("No trip coming up");
    expect(entry.props.imageUri).toBeUndefined();
  });

  it("ticks over at each midnight and ends on the empty state", () => {
    const now = at(2026, 12, 7, 15);
    const entries = countdownTimeline([trip()], now, "shelvr", photo);
    expect(entries.map((e) => e.props.headline ?? "empty")).toEqual([
      "3 days to go",
      "2 days to go",
      "Tomorrow",
      "Day 1 of 3",
      "Day 2 of 3",
      "Day 3 of 3",
      "empty",
    ]);
    expect(entries[0].date).toBe(now);
    for (const entry of entries.slice(1)) {
      expect([entry.date.getHours(), entry.date.getMinutes()]).toEqual([0, 0]);
    }
    expect(entries[1].date).toEqual(at(2026, 12, 8, 0));
  });

  it("carries the trip's name, dates, stops, link target and photo", () => {
    const [first] = countdownTimeline(
      [trip({ name: "Lisbon with Sam" })],
      at(2026, 12, 7),
      "shelvr",
      photo,
    );
    expect(first.props).toMatchObject({
      scheme: "shelvr",
      tripId: "trip1",
      label: "Lisbon with Sam",
      footnote: "8 stops · 5 from your saves",
      imageUri: "file:///w/lisbon.jpg",
    });
    expect(first.props.detail).toMatch(/10.*12/);
  });

  it("says Today for a one-day trip", () => {
    const entries = countdownTimeline(
      [trip({ dayCount: 1 })],
      at(2026, 12, 10),
      "shelvr",
    );
    expect(entries[0].props.headline).toBe("Today");
  });

  it("ends a far-off countdown on the start date, which stays true", () => {
    const entries = countdownTimeline(
      [trip({ startDate: "2027-06-01" })],
      at(2026, 12, 1),
      "shelvr",
    );
    expect(entries).toHaveLength(TIMELINE_DAYS + 1);
    expect(entries.at(-2)?.props.headline).toMatch(/days to go$/);
    expect(entries.at(-1)?.props.headline).toMatch(/^On /);
  });

  it("follows a trip already under way at the horizon to its end", () => {
    const now = at(2026, 12, 1);
    const entries = countdownTimeline(
      [trip({ startDate: "2027-01-29", dayCount: 5 })],
      now,
      "shelvr",
    );
    const headlines = entries.map((e) => e.props.headline ?? "empty");
    expect(headlines).not.toContain(expect.stringMatching(/^On /));
    expect(headlines.slice(-6)).toEqual([
      "Day 1 of 5",
      "Day 2 of 5",
      "Day 3 of 5",
      "Day 4 of 5",
      "Day 5 of 5",
      "empty",
    ]);
  });

  it("moves on to the next trip when one ends", () => {
    const lisbon = trip({ _id: "a" as CountdownTrip["_id"], dayCount: 2 });
    const porto = trip({
      _id: "b" as CountdownTrip["_id"],
      city: "Porto",
      startDate: "2026-12-15",
      dayCount: 1,
    });
    const entries = countdownTimeline(
      [porto, lisbon],
      at(2026, 12, 9),
      "shelvr",
      (t) => `file:///w/${t.city}.jpg`,
    );
    const rows = entries.map((e) => [
      e.props.tripId ?? "-",
      e.props.headline ?? "empty",
    ]);
    expect(rows).toEqual([
      ["a", "Tomorrow"],
      ["a", "Day 1 of 2"],
      ["a", "Day 2 of 2"],
      ["b", "3 days to go"],
      ["b", "2 days to go"],
      ["b", "Tomorrow"],
      ["b", "Today"],
      ["-", "empty"],
    ]);
    expect(entries[3].props.imageUri).toBe("file:///w/Porto.jpg");
    expect(entries[0].props.imageUri).toBe("file:///w/Lisbon.jpg");
  });
});

describe("timelineTrips", () => {
  it("lists each trip the timeline will show, in order", () => {
    const lisbon = trip({ _id: "a" as CountdownTrip["_id"] });
    const porto = trip({
      _id: "b" as CountdownTrip["_id"],
      startDate: "2026-12-20",
    });
    const far = trip({
      _id: "c" as CountdownTrip["_id"],
      startDate: "2028-01-01",
    });
    expect(
      timelineTrips([far, porto, lisbon], at(2026, 12, 1)).map((t) => t._id),
    ).toEqual(["a", "b", "c"]);
  });
});
