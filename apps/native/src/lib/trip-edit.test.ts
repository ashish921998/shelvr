import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanStop } from "@convex/model/tripPlan";

import {
  dropPlace,
  EDIT_HEADER_HEIGHT,
  EDIT_ROW_HEIGHT,
  editEntries,
  entryTops,
  matchSavePlaces,
  moveInLayout,
  moveTargets,
  onTrip,
  placeOf,
  type TripLayout,
} from "./trip-edit";

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
}));
vi.mock("convex/react", () => ({ useAction: vi.fn(), useMutation: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function stop(name: string, appleId?: string): TripPlanStop {
  return {
    _id: name as Id<"tripStops">,
    source: "suggested",
    name,
    lat: 38.7,
    lng: -9.1,
    ...(appleId !== undefined ? { appleId } : {}),
  };
}

const id = (name: string) => name as Id<"tripStops">;

const TRIP: TripLayout = {
  days: [[stop("A"), stop("B")], [stop("C")]],
  unplanned: [stop("X")],
};

const names = (trip: TripLayout) => ({
  days: trip.days.map((day) => day.map((s) => s.name)),
  unplanned: trip.unplanned.map((s) => s.name),
});

/** The worklet's inputs for the trip with `held` lifted out. */
function without(trip: TripLayout, held: string) {
  const rest = editEntries({
    days: trip.days.map((day) => day.filter((s) => s.name !== held)),
    unplanned: trip.unplanned.filter((s) => s.name !== held),
  });
  return {
    isStop: rest.map((entry) => entry.kind === "stop"),
    days: rest.map((entry) => entry.day),
  };
}

describe("editEntries and entryTops", () => {
  it("lists each day's header then its stops, with Unplanned last", () => {
    const entries = editEntries(TRIP);
    expect(
      entries.map((e) => (e.kind === "header" ? `#${e.day}` : e.stop.name)),
    ).toEqual(["#1", "A", "B", "#2", "C", "#0", "X"]);
    const { tops, height } = entryTops(entries);
    expect(tops.slice(0, 3)).toEqual([
      0,
      EDIT_HEADER_HEIGHT,
      EDIT_HEADER_HEIGHT + EDIT_ROW_HEIGHT,
    ]);
    expect(height).toBe(3 * EDIT_HEADER_HEIGHT + 4 * EDIT_ROW_HEIGHT);
  });
});

describe("dropPlace", () => {
  const { isStop, days } = without(TRIP, "A");
  // Without A: #1, B, #2, C, #0, X

  it("lands at the top of day 1 when held over its first slot", () => {
    expect(dropPlace(isStop, days, EDIT_HEADER_HEIGHT + 4)).toMatchObject({
      day: 1,
      index: 0,
    });
  });

  it("lands after B, still on day 1, just below B", () => {
    const y = EDIT_HEADER_HEIGHT + EDIT_ROW_HEIGHT + EDIT_ROW_HEIGHT / 2;
    expect(dropPlace(isStop, days, y)).toMatchObject({ day: 1, index: 1 });
  });

  it("lands on day 2 and on Unplanned further down", () => {
    const day2 = 2 * EDIT_HEADER_HEIGHT + EDIT_ROW_HEIGHT + EDIT_ROW_HEIGHT / 2;
    expect(dropPlace(isStop, days, day2)).toMatchObject({ day: 2, index: 0 });
    expect(dropPlace(isStop, days, 10_000)).toMatchObject({
      day: 0,
      index: 1,
    });
  });

  it("never lands above the first header", () => {
    expect(dropPlace(isStop, days, -500)).toMatchObject({ day: 1, index: 0 });
  });

  it("lands in an empty day after its header", () => {
    const trip: TripLayout = { days: [[stop("A")], []], unplanned: [] };
    const empty = without(trip, "A");
    // #1, #2, #0
    const y = 2 * EDIT_HEADER_HEIGHT + EDIT_ROW_HEIGHT / 2;
    expect(dropPlace(empty.isStop, empty.days, y)).toMatchObject({
      day: 2,
      index: 0,
    });
  });
});

describe("moveInLayout and placeOf", () => {
  it("moves within a day, across days and into Unplanned", () => {
    expect(names(moveInLayout(TRIP, id("B"), { day: 1, index: 0 }))).toEqual({
      days: [["B", "A"], ["C"]],
      unplanned: ["X"],
    });
    expect(names(moveInLayout(TRIP, id("X"), { day: 2, index: 99 }))).toEqual({
      days: [
        ["A", "B"],
        ["C", "X"],
      ],
      unplanned: [],
    });
    expect(names(moveInLayout(TRIP, id("A"), { day: 0, index: 0 }))).toEqual({
      days: [["B"], ["C"]],
      unplanned: ["A", "X"],
    });
  });

  it("leaves the trip as it was for an unknown stop or day", () => {
    expect(moveInLayout(TRIP, id("Z"), { day: 1, index: 0 })).toBe(TRIP);
    expect(moveInLayout(TRIP, id("A"), { day: 5, index: 0 })).toBe(TRIP);
  });

  it("finds where a stop is", () => {
    expect(placeOf(TRIP, id("B"))).toEqual({ day: 1, index: 1 });
    expect(placeOf(TRIP, id("X"))).toEqual({ day: 0, index: 0 });
    expect(placeOf(TRIP, id("Z"))).toBeNull();
  });
});

describe("moveTargets", () => {
  it("offers every other day and Unplanned", () => {
    expect(
      moveTargets({ dayCount: 3, startDate: undefined }, 2).map((m) => m.day),
    ).toEqual([1, 3, 0]);
    expect(
      moveTargets({ dayCount: 2, startDate: undefined }, 0).map((m) => m.day),
    ).toEqual([1, 2]);
  });
});

describe("Add a place helpers", () => {
  const places = [
    { itemId: "i1" as Id<"items">, name: "Manteigaria", title: "Nata crawl" },
    {
      itemId: "i1" as Id<"items">,
      name: "Time Out Market",
      title: "Nata crawl",
    },
    { itemId: "i2" as Id<"items">, name: "Red Frog" },
  ];

  it("matches every typed word against the place and its save", () => {
    expect(matchSavePlaces(places, "")).toHaveLength(3);
    expect(matchSavePlaces(places, "nata time").map((p) => p.name)).toEqual([
      "Time Out Market",
    ]);
    expect(matchSavePlaces(places, "frog")).toHaveLength(1);
  });

  it("knows a result already on the trip by Apple id or name", () => {
    const trip: TripLayout = {
      days: [[stop("Kafeine", "A-1")]],
      unplanned: [stop("Red Frog")],
    };
    expect(onTrip(trip, { name: "Other", appleId: "A-1" })).toBe(true);
    expect(onTrip(trip, { name: " red frog " })).toBe(true);
    expect(onTrip(trip, { name: "New place", appleId: "A-2" })).toBe(false);
  });
});
