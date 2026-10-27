import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import { distanceKm } from "./trip";
import {
  balanceSuggestions,
  chainNames,
  GENERIC_QUERIES,
  INTEREST_CATEGORIES,
  interestOfCategory,
  isKnownChain,
  keepSuggestion,
  layoutTripPlan,
  nextBatch,
  searchPoints,
  searchQueues,
  SUGGEST_RADIUS_KM,
  tasteQueries,
  tasteWord,
  type PlannedStop,
  type Suggestion,
} from "./tripSuggest";
import { TRIP_INTERESTS } from "./tripPlan";

const LISBON = { lat: 38.7223, lng: -9.1393 };

/** Apple Maps Server API PoiCategory values (developer.apple.com/documentation/applemapsserverapi/poicategory). */
const APPLE_POI_CATEGORIES = new Set([
  "Airport",
  "AmusementPark",
  "Aquarium",
  "Bakery",
  "Beach",
  "Brewery",
  "Cafe",
  "Castle",
  "Distillery",
  "FoodMarket",
  "Fortress",
  "Landmark",
  "Library",
  "Marina",
  "Museum",
  "MusicVenue",
  "NationalMonument",
  "NationalPark",
  "Nightlife",
  "Park",
  "Planetarium",
  "Restaurant",
  "Store",
  "Theater",
  "Winery",
  "Zoo",
]);

function suggestion(
  name: string,
  fields: Partial<Suggestion> = {},
): Suggestion {
  return { name, ...LISBON, interest: "food", ...fields };
}

describe("interest categories", () => {
  it("searches only real Apple categories, each under one interest", () => {
    const all = TRIP_INTERESTS.flatMap((i) => [...INTEREST_CATEGORIES[i]]);
    expect(all.filter((c) => !APPLE_POI_CATEGORIES.has(c))).toEqual([]);
    expect(new Set(all).size).toBe(all.length);
    expect(interestOfCategory("Cafe")).toBe("coffee");
    expect(interestOfCategory("Nightlife")).toBe("drinks");
    expect(interestOfCategory("Hospital")).toBeUndefined();
    expect(interestOfCategory(undefined)).toBeUndefined();
  });

  it("never searches the bare word landmark", () => {
    const words = TRIP_INTERESTS.flatMap((i) => [...GENERIC_QUERIES[i]]);
    expect(words).not.toContain("landmark");
    expect(words).not.toContain("landmarks");
  });
});

describe("tasteQueries", () => {
  it("files a save's specific tags under its pins' interests, most frequent first", () => {
    const taste = tasteQueries(
      [
        { tags: ["ramen", "food", "Lisbon"], categories: ["Restaurant"] },
        { tags: ["ramen", "natural wine"], categories: ["Restaurant"] },
        { tags: ["speakeasy bar", "cocktails"], categories: ["Nightlife"] },
        { tags: ["vintage"], categories: [] },
        { tags: ["matcha", "coffee"], categories: [] },
        { tags: ["sunset"], categories: [] },
      ],
      ["food", "drinks", "coffee", "shopping"],
      "Lisbon",
    );
    expect(taste).toEqual({
      food: ["ramen", "natural wine"],
      drinks: ["speakeasy bar", "cocktails"],
      coffee: ["matcha"],
      shopping: ["vintage"],
    });
  });

  it("leaves out interests that were not chosen", () => {
    const taste = tasteQueries(
      [{ tags: ["ramen"], categories: ["Restaurant"] }],
      ["coffee"],
      "Tokyo",
    );
    expect(taste).toEqual({ coffee: [] });
  });

  it("rejects generic, long, numeric and city tags", () => {
    expect(tasteWord("Food", "Lisbon")).toBeNull();
    expect(tasteWord("landmark", "Lisbon")).toBeNull();
    expect(tasteWord("lisbon eats", "Lisbon")).toBeNull();
    expect(tasteWord("top 10", "Lisbon")).toBeNull();
    expect(tasteWord("the best views in the city", "Lisbon")).toBeNull();
    expect(tasteWord("  Pastel  de nata ", "Lisbon")).toBe("pastel de nata");
  });
});

describe("searchQueues", () => {
  it("searches taste words, then plain words, at the centre, then spreads out", () => {
    const [food, sights] = searchQueues(
      ["food", "sights"],
      { food: ["ramen"] },
      LISBON,
    );
    expect(food.map((s) => s.query)).toEqual([
      "ramen",
      "restaurants",
      "local food",
      "ramen",
      "restaurants",
      "local food",
      "ramen",
    ]);
    expect(food.slice(0, 3).every((s) => s.at === food[0].at)).toBe(true);
    expect(sights[0]).toMatchObject({
      interest: "sights",
      query: "attractions",
      categories: INTEREST_CATEGORIES.sights,
    });
  });

  it("spreads points a few km from the centre", () => {
    const [centre, ...spread] = searchPoints(LISBON);
    expect(centre).toEqual(LISBON);
    for (const point of spread) {
      const km = distanceKm(LISBON, point);
      expect(km).toBeGreaterThan(4);
      expect(km).toBeLessThan(7);
    }
  });

  it("takes one search per wanted interest per batch", () => {
    const queues = searchQueues(["food", "coffee", "drinks"], {}, LISBON);
    const first = nextBatch(queues, (i) => i !== "coffee", 5);
    expect(first.map((s) => [s.interest, s.query])).toEqual([
      ["food", "restaurants"],
      ["drinks", "bars"],
    ]);
    const second = nextBatch(queues, () => true, 2);
    expect(second.map((s) => [s.interest, s.query])).toEqual([
      ["food", "local food"],
      ["coffee", "coffee"],
    ]);
  });
});

describe("keeping suggestions", () => {
  const context = { centre: LISBON, been: new Set<string>(), taken: [] };

  it("drops results beyond the distance cutoff, matched on distance not locality", () => {
    const far = suggestion("Café Porto", {
      lat: 41.1579,
      lng: -8.6291,
      area: "Lisbon",
    });
    expect(distanceKm(LISBON, far)).toBeGreaterThan(SUGGEST_RADIUS_KM);
    expect(keepSuggestion(far, context)).toBe(false);
    const near = suggestion("Taberna", {
      lat: LISBON.lat + 0.1,
      area: "Somewhere else",
    });
    expect(keepSuggestion(near, context)).toBe(true);
  });

  it("drops known chains and branch labels", () => {
    expect(isKnownChain("Starbucks")).toBe(true);
    expect(isKnownChain("McDonald's Rossio")).toBe(true);
    expect(isKnownChain("KFC")).toBe(true);
    expect(isKnownChain("KFC Museum of Fried Things")).toBe(false);
    expect(isKnownChain("Manteigaria")).toBe(false);
    expect(keepSuggestion(suggestion("Starbucks"), context)).toBe(false);
  });

  it("finds chains by one name under several Apple ids", () => {
    const chains = chainNames([
      { name: "Padaria Portuguesa", appleId: "a" },
      { name: "Padaria Portuguesa", appleId: "b" },
      { name: "padaria portuguesa", appleId: "c" },
      { name: "Manteigaria", appleId: "d" },
      { name: "Manteigaria", appleId: "d" },
      { name: "Manteigaria", appleId: "e" },
    ]);
    expect([...chains]).toEqual(["padariaportuguesa"]);
  });

  it("drops visited places, saved places, and results of another interest's kind", () => {
    expect(
      keepSuggestion(suggestion("Time Out Market"), {
        ...context,
        been: new Set(["timeoutmarket"]),
      }),
    ).toBe(false);
    expect(
      keepSuggestion(suggestion("Anything", { appleId: "x" }), {
        ...context,
        taken: [{ name: "Another name", ...LISBON, appleId: "x" }],
      }),
    ).toBe(false);
    expect(
      keepSuggestion(suggestion("Time Out Market"), {
        ...context,
        taken: [
          { name: "Time Out market", lat: LISBON.lat + 0.001, lng: LISBON.lng },
        ],
      }),
    ).toBe(false);
    expect(
      keepSuggestion(suggestion("A bar", { category: "Nightlife" }), context),
    ).toBe(false);
  });

  it("balances across interests in turn and never repeats a venue", () => {
    const lists = new Map([
      [
        "food" as const,
        [
          suggestion("F1", { appleId: "1" }),
          suggestion("F2", { appleId: "2" }),
          suggestion("F3", { appleId: "3" }),
        ],
      ],
      [
        "coffee" as const,
        [
          suggestion("C1", { appleId: "1", interest: "coffee" }),
          suggestion("C2", { appleId: "4", interest: "coffee" }),
        ],
      ],
      ["sights" as const, []],
    ]);
    const picked = balanceSuggestions(lists, ["food", "coffee", "sights"], 4);
    expect(picked.map((p) => p.name)).toEqual(["F1", "C2", "F2", "F3"]);
    expect(
      balanceSuggestions(lists, ["food", "coffee"], 9, new Set(["f1"])).map(
        (p) => p.name,
      ),
    ).toEqual(["F2", "C1", "F3", "C2"]);
  });
});

describe("layoutTripPlan", () => {
  const itemId = "items|1" as Id<"items">;
  const stop = (
    name: string,
    lat: number,
    fields: Partial<PlannedStop> = {},
  ): PlannedStop => ({
    source: "suggested",
    name,
    lat,
    lng: -9.14,
    ...fields,
  });

  it("puts saves first, groups nearby stops, and leaves the rest unplanned", () => {
    const stops = [
      stop("Saved", 38.7, { source: "save", itemId, why: "From a reel" }),
      stop("North A", 38.8),
      stop("North B", 38.801),
      stop("South A", 38.7005),
      stop("North C", 38.79),
    ];
    const trip = layoutTripPlan(stops, { days: 2, pace: "easy" });
    expect(trip.days.map((day) => day.map((s) => s.name).sort())).toEqual([
      ["Saved", "South A"],
      ["North A", "North B", "North C"],
    ]);
    expect(trip.unplanned).toEqual([]);

    const short = layoutTripPlan(stops, { days: 1, pace: "easy" });
    expect(short.days[0].map((s) => s.name).sort()).toEqual([
      "North A",
      "North B",
      "Saved",
    ]);
    expect(short.unplanned.map((s) => s.name)).toEqual(["South A", "North C"]);
  });

  it("gives obvious slots from the category and orders the day by them", () => {
    const trip = layoutTripPlan(
      [
        stop("Bar", 38.7, { category: "Nightlife" }),
        stop("Meal 1", 38.7001, { category: "Restaurant" }),
        stop("Museum", 38.7002, { category: "Museum" }),
        stop("Meal 2", 38.7003, { category: "Restaurant" }),
        stop("Cafe", 38.7004, { category: "Cafe" }),
        stop("Meal 3", 38.7005, { category: "Restaurant" }),
      ],
      { days: 1, pace: "packed" },
    );
    expect(trip.days[0].map((s) => [s.name, s.slot])).toEqual([
      ["Cafe", "morning"],
      ["Meal 1", "lunch"],
      ["Museum", undefined],
      ["Meal 3", undefined],
      ["Meal 2", "dinner"],
      ["Bar", "evening"],
    ]);
  });

  it("keeps empty days when there are fewer stops than days", () => {
    const trip = layoutTripPlan([stop("Only", 38.7)], {
      days: 3,
      pace: "balanced",
    });
    expect(trip.days.map((d) => d.length)).toEqual([1, 0, 0]);
  });
});
