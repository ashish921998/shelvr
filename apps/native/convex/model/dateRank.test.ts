import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { ApplePoi } from "./appleMaps";
import {
  dateSlotOf,
  fillTargets,
  keepDateSuggestion,
  MAX_EVENINGS,
  rankEvenings,
  RECENT_SAVE_MS,
  savedDateStops,
  savedScore,
  suggestedDateStop,
  type DateCandidate,
  type ScoredStop,
} from "./dateRank";
import { type DateStop, MAX_WALK_KM, pairs, swapStop } from "./datePlan";
import { placeKey } from "./plan";
import { distanceKm } from "./trip";

const NOW = 1_800_000_000_000;
const AUSTIN = { lat: 30.2672, lng: -97.7431 };
/** About 111 m north per step. */
const north = (steps: number) => ({
  lat: AUSTIN.lat + steps * 0.001,
  lng: AUSTIN.lng,
});
const item = (n: number) => `item${n}` as Id<"items">;
const fixed = () => 0;

function candidate(
  overrides: Partial<DateCandidate> & { name: string },
): DateCandidate {
  return {
    itemId: item(1),
    ...AUSTIN,
    tags: [],
    ownTags: true,
    savedAt: NOW - 2 * RECENT_SAVE_MS,
    ...overrides,
  };
}

function stop(
  overrides: Partial<DateStop> & Pick<DateStop, "name" | "slot">,
): DateStop {
  return { source: "save", itemId: item(1), ...AUSTIN, ...overrides };
}

const scored = (s: DateStop, score = 2): ScoredStop => ({ stop: s, score });

describe("dateSlotOf", () => {
  it("puts a restaurant first and a bar or bakery second on a classic date", () => {
    expect(dateSlotOf("classic", "Restaurant", [], true)).toBe("first");
    expect(dateSlotOf("classic", "Nightlife", [], true)).toBe("second");
    expect(dateSlotOf("classic", "Winery", [], true)).toBe("second");
    expect(dateSlotOf("classic", "Bakery", [], true)).toBe("second");
    expect(dateSlotOf("classic", "Park", [], true)).toBeNull();
  });

  it("reads a dessert shop Apple filed as a restaurant from the save's own tags", () => {
    expect(dateSlotOf("classic", "Restaurant", ["gelato"], true)).toBe(
      "second",
    );
    expect(dateSlotOf("classic", "Restaurant", ["coffee"], true)).toBeNull();
    // A guide's tags describe the whole guide, not this place.
    expect(dateSlotOf("classic", "Restaurant", ["gelato"], false)).toBe(
      "first",
    );
  });

  it("puts a café first and a park or beach second on a low-key date", () => {
    expect(dateSlotOf("lowkey", "Cafe", [], true)).toBe("first");
    expect(dateSlotOf("lowkey", "Bakery", ["coffee"], true)).toBe("first");
    expect(dateSlotOf("lowkey", "Bakery", [], true)).toBeNull();
    expect(dateSlotOf("lowkey", "Park", [], true)).toBe("second");
    expect(dateSlotOf("lowkey", "Beach", [], true)).toBe("second");
    expect(dateSlotOf("lowkey", "Restaurant", [], true)).toBeNull();
  });

  it("falls back to tags only for a place with no category on a one-place save", () => {
    expect(dateSlotOf("classic", undefined, ["tacos"], true)).toBe("first");
    expect(dateSlotOf("classic", undefined, ["cocktails"], true)).toBe(
      "second",
    );
    expect(dateSlotOf("lowkey", undefined, ["matcha"], true)).toBe("first");
    expect(dateSlotOf("lowkey", undefined, ["hiking"], true)).toBe("second");
    expect(dateSlotOf("classic", undefined, ["tacos"], false)).toBeNull();
    expect(dateSlotOf("classic", undefined, [], true)).toBeNull();
  });

  it("never plans a stop at somewhere to sleep", () => {
    expect(dateSlotOf("classic", "Hotel", ["cocktails"], true)).toBeNull();
  });
});

describe("savedScore", () => {
  it("weighs a date-tagged, recent save above an old untagged one", () => {
    const old = candidate({ name: "Old", category: "Restaurant" });
    const fresh = candidate({
      name: "Fresh",
      category: "Restaurant",
      tags: ["date night"],
      savedAt: NOW - 1000,
    });
    expect(savedScore(old, NOW)).toBe(2);
    expect(savedScore(fresh, NOW)).toBe(6);
  });
});

describe("savedDateStops", () => {
  it("keeps the places that fit and one stop per venue", () => {
    const stops = savedDateStops(
      "classic",
      [
        candidate({ name: "Uchi", category: "Restaurant" }),
        candidate({
          name: "Uchi",
          category: "Restaurant",
          itemId: item(2),
          tags: ["date night"],
        }),
        candidate({ name: "Zilker Park", category: "Park", ...north(3) }),
        candidate({
          name: "Small Victory",
          category: "Nightlife",
          ...north(2),
        }),
      ],
      NOW,
    );
    expect(stops.map((s) => [s.stop.name, s.stop.slot, s.score])).toEqual([
      ["Uchi", "first", 5],
      ["Small Victory", "second", 2],
    ]);
    expect(stops[0].stop.itemId).toBe(item(2));
  });
});

describe("rankEvenings", () => {
  const dinner = stop({ name: "Uchi", slot: "first" });
  const bar = stop({ name: "Small Victory", slot: "second", ...north(5) });
  const farBar = stop({ name: "Far Bar", slot: "second", ...north(20) });

  it("pairs stops a walk apart, never farther", () => {
    expect(distanceKm(dinner, farBar)).toBeGreaterThan(MAX_WALK_KM);
    const { stops, evenings } = rankEvenings(
      [scored(dinner), scored(bar), scored(farBar)],
      fixed,
    );
    expect(
      evenings.map((e) => [stops[e.first].name, stops[e.second].name]),
    ).toEqual([["Uchi", "Small Victory"]]);
  });

  it("never makes an evening of two suggestions", () => {
    const { evenings } = rankEvenings(
      [
        scored({ ...dinner, source: "suggested", itemId: undefined }, 0),
        scored({ ...bar, source: "suggested", itemId: undefined }, 0),
      ],
      fixed,
    );
    expect(evenings).toEqual([]);
  });

  it("never pairs a venue with itself", () => {
    const { evenings } = rankEvenings(
      [scored(dinner), scored({ ...dinner, slot: "second" })],
      fixed,
    );
    expect(evenings).toEqual([]);
  });

  it("ranks the strongest pair first and shows new places before repeats", () => {
    const best = stop({ name: "Best", slot: "first", ...north(1) });
    const second = stop({ name: "Bar Two", slot: "second", ...north(2) });
    const { stops, evenings } = rankEvenings(
      [scored(dinner, 2), scored(best, 6), scored(bar, 3), scored(second, 2)],
      fixed,
    );
    const names = evenings.map((e) => [
      stops[e.first].name,
      stops[e.second].name,
    ]);
    expect(names[0]).toEqual(["Best", "Small Victory"]);
    expect(names[1]).toEqual(["Uchi", "Bar Two"]);
    expect(names).toHaveLength(4);
  });

  it("puts the closer of two otherwise equal evenings first", () => {
    const near = stop({ name: "Near Bar", slot: "second", ...north(1) });
    const far = stop({ name: "Far Bar", slot: "second", ...north(12) });
    const { stops, evenings } = rankEvenings(
      [scored(dinner), scored(far), scored(near)],
      fixed,
    );
    expect(stops[evenings[0].second].name).toBe("Near Bar");
  });

  it("offers at most a handful of evenings", () => {
    const many = Array.from({ length: 6 }, (_, i) => [
      scored(stop({ name: `Dinner ${i}`, slot: "first", ...north(i) })),
      scored(stop({ name: `Bar ${i}`, slot: "second", ...north(i + 0.5) })),
    ]).flat();
    expect(rankEvenings(many, fixed).evenings).toHaveLength(MAX_EVENINGS);
  });
});

describe("swapStop", () => {
  const dinner = stop({ name: "Uchi", slot: "first" });
  const bar = stop({ name: "Small Victory", slot: "second", ...north(1) });
  const otherBar = stop({
    name: "Roosevelt Room",
    slot: "second",
    ...north(2),
  });
  const farBar = stop({ name: "Far Bar", slot: "second", ...north(30) });

  it("swaps in the nearest stop not yet tried, then wraps back to the nearest", () => {
    const wideBar = stop({ name: "Wide Bar", slot: "second", ...north(12) });
    const stops = [dinner, bar, wideBar, otherBar];
    expect(swapStop(stops, { first: 0, second: 1 }, "second")?.second).toBe(3);
    expect(swapStop(stops, { first: 0, second: 3 }, "second")?.second).toBe(2);
    expect(swapStop(stops, { first: 0, second: 2 }, "second")?.second).toBe(1);
  });

  it("swaps in the next stop that still makes an evening with the one kept", () => {
    const stops = [dinner, bar, farBar, otherBar];
    expect(swapStop(stops, { first: 0, second: 1 }, "second")).toEqual({
      first: 0,
      second: 3,
    });
    expect(swapStop(stops, { first: 0, second: 3 }, "second")).toEqual({
      first: 0,
      second: 1,
    });
  });

  it("never swaps in the same venue as the stop kept", () => {
    const sameVenue = { ...dinner, name: "Uchi", slot: "second" as const };
    expect(
      swapStop([dinner, bar, sameVenue], { first: 0, second: 1 }, "second"),
    ).toBeNull();
  });

  it("has nothing to swap when no other stop pairs", () => {
    expect(
      swapStop([dinner, bar, farBar], { first: 0, second: 1 }, "second"),
    ).toBeNull();
    expect(
      swapStop([dinner, bar], { first: 0, second: 1 }, "first"),
    ).toBeNull();
  });

  it("keeps at least one saved stop in the evening", () => {
    const suggestedBar = { ...bar, source: "suggested" as const };
    const suggestedDinner = {
      ...dinner,
      name: "Suggested dinner",
      source: "suggested" as const,
    };
    expect(pairs(suggestedDinner, suggestedBar)).toBe(false);
    expect(
      swapStop(
        [dinner, suggestedBar, suggestedDinner],
        { first: 0, second: 1 },
        "first",
      ),
    ).toBeNull();
  });
});

describe("fillTargets", () => {
  it("searches around the best saved stops for the stop each is missing", () => {
    const targets = fillTargets([
      scored(stop({ name: "Bar", slot: "second", ...north(10) }), 3),
      scored(stop({ name: "Uchi", slot: "first" }), 5),
      scored(stop({ name: "Uchi next door", slot: "first", ...north(1) }), 4),
    ]);
    expect(targets.map((t) => [t.anchor.name, t.slot])).toEqual([
      ["Uchi", "second"],
      ["Bar", "first"],
    ]);
  });
});

describe("keepDateSuggestion", () => {
  const anchor = stop({ name: "Uchi", slot: "first" });
  const context = {
    kind: "classic" as const,
    slot: "second" as const,
    anchor,
    been: new Set<string>(),
    taken: [anchor],
    chains: new Set<string>(),
  };
  const poi = (overrides: Partial<ApplePoi>): ApplePoi => ({
    name: "Small Victory",
    category: "Nightlife",
    appleId: "I1",
    ...north(3),
    ...overrides,
  });

  it("keeps a bar a walk from the anchor", () => {
    expect(keepDateSuggestion(poi({}), context)).toBe(true);
    expect(suggestedDateStop(poi({}), "second")).toMatchObject({
      slot: "second",
      source: "suggested",
      name: "Small Victory",
    });
  });

  it("drops results too far, of the wrong kind, uncategorised, chains or visited", () => {
    expect(keepDateSuggestion(poi(north(30)), context)).toBe(false);
    expect(keepDateSuggestion(poi({ category: "Park" }), context)).toBe(false);
    expect(keepDateSuggestion(poi({ category: undefined }), context)).toBe(
      false,
    );
    expect(keepDateSuggestion(poi({ name: "Starbucks" }), context)).toBe(false);
    expect(
      keepDateSuggestion(poi({}), {
        ...context,
        been: new Set([placeKey("Small Victory")]),
      }),
    ).toBe(false);
    expect(
      keepDateSuggestion(poi({}), {
        ...context,
        chains: new Set([placeKey("Small Victory")]),
      }),
    ).toBe(false);
  });

  it("drops a place already in the plan", () => {
    expect(
      keepDateSuggestion(
        poi({ name: "Uchi", category: "Restaurant", ...AUSTIN }),
        {
          ...context,
          slot: "first",
        },
      ),
    ).toBe(false);
  });
});
