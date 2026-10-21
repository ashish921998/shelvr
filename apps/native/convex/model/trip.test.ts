import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import {
  buildTrip,
  clusterPlaces,
  keepNearby,
  swapStop,
  tripPlaceCap,
  type TripCandidate,
  type TripStop,
} from "./trip";

// Two Lisbon neighbourhoods about 3 km apart.
const ALFAMA = { lat: 38.7118, lng: -9.1303 };
const BELEM = { lat: 38.6976, lng: -9.2063 };

function near(base: { lat: number; lng: number }, step: number) {
  return { lat: base.lat + step * 0.001, lng: base.lng + step * 0.001 };
}

function candidate(
  n: number,
  fields: Partial<TripCandidate> = {},
): TripCandidate {
  return {
    itemId: `item${n}` as Id<"items">,
    name: `Place ${n}`,
    why: "Worth it",
    slot: "any",
    ...fields,
  };
}

describe("clusterPlaces", () => {
  it("puts each neighbourhood on its own day", () => {
    const points = [
      near(ALFAMA, 0),
      near(BELEM, 0),
      near(ALFAMA, 1),
      near(BELEM, 1),
      near(ALFAMA, 2),
    ];
    const days = clusterPlaces(points, 2, 5);
    expect(new Set([days[0], days[2], days[4]]).size).toBe(1);
    expect(new Set([days[1], days[3]]).size).toBe(1);
    expect(days[0]).not.toBe(days[1]);
  });

  it("never puts more than capacity on a day", () => {
    const points = Array.from({ length: 6 }, (_, i) => near(ALFAMA, i));
    const days = clusterPlaces(points, 2, 3);
    expect(days.filter((d) => d === 0)).toHaveLength(3);
    expect(days.filter((d) => d === 1)).toHaveLength(3);
  });

  it("gives the same days for the same places", () => {
    const points = [near(ALFAMA, 0), near(BELEM, 0), near(ALFAMA, 3)];
    expect(clusterPlaces(points, 2, 5)).toEqual(clusterPlaces(points, 2, 5));
  });
});

describe("buildTrip", () => {
  it("starts with the day holding the best place and orders by time of day", () => {
    const trip = buildTrip(
      [
        candidate(1, { location: near(BELEM, 0), slot: "dinner" }),
        candidate(2, { location: near(ALFAMA, 0), slot: "lunch" }),
        candidate(3, { location: near(BELEM, 1), slot: "morning" }),
        candidate(4, { location: near(ALFAMA, 1), slot: "dinner" }),
      ],
      { days: 2, pace: "easy" },
    );
    expect(trip.days[0].stops.map((s) => s.name)).toEqual([
      "Place 3",
      "Place 1",
    ]);
    expect(trip.days[1].stops.map((s) => s.name)).toEqual([
      "Place 2",
      "Place 4",
    ]);
    expect(trip.days[0].stops[0]).toMatchObject({
      slot: "morning",
      lat: near(BELEM, 1).lat,
    });
  });

  it("names the missing meals as gaps, never filling them", () => {
    const trip = buildTrip([candidate(1, { slot: "lunch" })], {
      days: 2,
      pace: "balanced",
    });
    expect(trip.days[0].gaps).toEqual(["dinner"]);
    // An empty day has nothing to have a gap in.
    expect(trip.days[1]).toEqual({ areas: [], stops: [], gaps: [] });
  });

  it("sends places past the trip's room to the wishlist in rank order", () => {
    const trip = buildTrip(
      Array.from({ length: 5 }, (_, i) => candidate(i + 1)),
      { days: 1, pace: "easy" },
    );
    expect(trip.days[0].stops).toHaveLength(3);
    expect(trip.wishlist.map((s) => s.name)).toEqual(["Place 4", "Place 5"]);
  });

  it("puts an unlocated place on the day already in its area", () => {
    const trip = buildTrip(
      [
        candidate(1, { location: near(ALFAMA, 0), area: "Alfama, Lisbon" }),
        candidate(2, { location: near(BELEM, 0), area: "Belém" }),
        candidate(3, { area: "belém" }),
      ],
      { days: 2, pace: "easy" },
    );
    const belem = trip.days.find((day) => day.areas[0] === "Belém");
    expect(belem?.stops.map((s) => s.name)).toEqual(["Place 2", "Place 3"]);
    expect(trip.days[0].areas).toEqual(["Alfama"]);
  });
});

describe("tripPlaceCap", () => {
  it("scales with the days, never below a packed 5-day trip", () => {
    expect(tripPlaceCap(1)).toBe(35);
    expect(tripPlaceCap(5)).toBe(35);
    expect(tripPlaceCap(10)).toBe(70);
    expect(tripPlaceCap(15)).toBe(105);
  });
});

describe("keepNearby", () => {
  const PORTO = { lat: 41.1579, lng: -8.6291 };

  it("drops a same-name place in another city", () => {
    expect(keepNearby([ALFAMA, PORTO, null], ALFAMA)).toEqual([
      ALFAMA,
      null,
      null,
    ]);
  });

  it("measures from the median when the city is unknown", () => {
    expect(keepNearby([ALFAMA, BELEM, PORTO], null)).toEqual([
      ALFAMA,
      BELEM,
      null,
    ]);
  });
});

describe("swapStop", () => {
  const stop = (name: string, fields: Partial<TripStop> = {}): TripStop => ({
    itemId: `item-${name}` as Id<"items">,
    name,
    why: "Worth it",
    slot: "afternoon",
    ...fields,
  });

  it("takes the nearest wishlist place for the same time of day", () => {
    const trip = {
      days: [
        {
          areas: [],
          stops: [stop("Lunch spot", { slot: "lunch", ...ALFAMA })],
          gaps: ["dinner" as const],
        },
      ],
      wishlist: [
        stop("Far lunch", { slot: "lunch", ...BELEM }),
        stop("Near sight", { ...near(ALFAMA, 1) }),
        stop("Near lunch", { slot: "lunch", ...near(ALFAMA, 1) }),
      ],
    };
    const swapped = swapStop(trip, 0, 0);
    expect(swapped?.days[0].stops.map((s) => s.name)).toEqual(["Near lunch"]);
    expect(swapped?.days[0].gaps).toEqual(["dinner"]);
    expect(swapped?.wishlist.map((s) => s.name)).toEqual([
      "Far lunch",
      "Near sight",
      "Lunch spot",
    ]);
  });

  it("names the meal the swap leaves uncovered", () => {
    const trip = {
      days: [
        {
          areas: [],
          stops: [stop("Dinner", { slot: "dinner" })],
          gaps: ["lunch" as const],
        },
      ],
      wishlist: [stop("Sight")],
    };
    expect(swapStop(trip, 0, 0)?.days[0].gaps).toEqual(["lunch", "dinner"]);
  });

  it("keeps the day in time order when the newcomer has another slot", () => {
    const trip = {
      days: [
        {
          areas: [],
          stops: [
            stop("Breakfast", { slot: "morning" }),
            stop("Lunch", { slot: "lunch" }),
            stop("Dinner", { slot: "dinner" }),
          ],
          gaps: [],
        },
      ],
      wishlist: [stop("Night view", { slot: "evening" })],
    };
    const swapped = swapStop(trip, 0, 1);
    expect(swapped?.days[0].stops.map((s) => s.name)).toEqual([
      "Breakfast",
      "Dinner",
      "Night view",
    ]);
    expect(swapped?.replacement.name).toBe("Night view");
  });

  it("is null with nothing to swap in", () => {
    const trip = {
      days: [{ areas: [], stops: [stop("A")], gaps: [] }],
      wishlist: [],
    };
    expect(swapStop(trip, 0, 0)).toBeNull();
    expect(swapStop({ ...trip, wishlist: [stop("B")] }, 0, 3)).toBeNull();
  });
});
