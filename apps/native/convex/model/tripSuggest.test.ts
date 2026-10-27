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
  mergeSavedNamesakes,
  namesake,
  LODGING_CATEGORIES,
  nameWithin,
  nextBatch,
  routeKm,
  routeOrder,
  samePlace,
  saveWhy,
  searchPoints,
  searchQueues,
  spreadSaves,
  SUGGEST_RADIUS_KM,
  tasteQueries,
  tasteWord,
  type PlannedStop,
  type Suggestion,
} from "./tripSuggest";
import { TRIP_INTERESTS } from "./tripPlan";
import type { PlanPlace, PlanSource } from "./plan";

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
  "Campground",
  "Castle",
  "Distillery",
  "FoodMarket",
  "Fortress",
  "Hotel",
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
  "RVPark",
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

  it("names only real Apple categories as lodging", () => {
    expect(
      [...LODGING_CATEGORIES].filter((c) => !APPLE_POI_CATEGORIES.has(c)),
    ).toEqual([]);
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

  it("drops lodging, whatever interest searched it", () => {
    for (const category of ["Hotel", "Campground", "RVPark"]) {
      expect(
        keepSuggestion(
          suggestion("Somewhere to sleep", { category, interest: "food" }),
          context,
        ),
      ).toBe(false);
    }
    expect(
      keepSuggestion(
        suggestion("Taberna", { category: "Restaurant" }),
        context,
      ),
    ).toBe(true);
  });

  it("drops a result whose name holds a saved place's name a few doors away, like its hotel", () => {
    const saved = { name: "Santa Joana", ...LISBON };
    const nextDoor = { lat: LISBON.lat + 0.001, lng: LISBON.lng };
    expect(
      keepSuggestion(suggestion("Locke de Santa Joana", nextDoor), {
        ...context,
        taken: [saved],
      }),
    ).toBe(false);
    expect(
      keepSuggestion(suggestion("Santa", nextDoor), {
        ...context,
        taken: [{ name: "Café Santa Joana", ...LISBON }],
      }),
    ).toBe(false);
    // Far apart, a one-word name is another venue.
    expect(
      keepSuggestion(suggestion("Prado Bar", { lat: 38.74 }), {
        ...context,
        taken: [{ name: "Prado", ...LISBON }],
      }),
    ).toBe(true);
    // Only whole words count.
    expect(
      keepSuggestion(suggestion("Santa Joanas", nextDoor), {
        ...context,
        taken: [saved],
      }),
    ).toBe(true);
  });

  it("matches names inside names by whole words, ignoring case and accents", () => {
    expect(nameWithin("Santa Joana", "Locke de Santa Joana")).toBe(true);
    expect(nameWithin("LOCKE DE SANTA JOANA", "santa joana")).toBe(true);
    expect(nameWithin("Cafe Sao Bento", "Café São Bento Lisboa")).toBe(true);
    expect(nameWithin("O'Kilo", "Okilo Bar")).toBe(true);
    expect(nameWithin("Santa Joana", "Santa Joanas")).toBe(false);
    expect(nameWithin("Joana Santa", "Santa Joana")).toBe(false);
    expect(nameWithin("", "Santa Joana")).toBe(false);
    expect(
      samePlace(
        { name: "Santa Joana", ...LISBON },
        {
          name: "Locke de Santa Joana",
          lat: LISBON.lat + 0.002,
          lng: LISBON.lng,
        },
      ),
    ).toBe(true);
    expect(
      samePlace(
        { name: "Santa Joana", ...LISBON },
        {
          name: "Locke de Santa Joana",
          lat: LISBON.lat + 0.01,
          lng: LISBON.lng,
        },
      ),
    ).toBe(false);
  });

  it("drops a saved place's namesake anywhere in the city, but not one-word matches", () => {
    // The saved pin is a lookup miss 8 km away, so the 300 m rule alone would keep the hotel.
    const savedFar = {
      name: "Santa Joana",
      lat: LISBON.lat + 0.07,
      lng: LISBON.lng,
    };
    const hotel = suggestion("Locke de Santa Joana");
    expect(namesake(savedFar, hotel)).toBe(true);
    expect(keepSuggestion(hotel, { ...context, taken: [savedFar] })).toBe(
      false,
    );
    const oneWord = { name: "Prado", lat: LISBON.lat + 0.07, lng: LISBON.lng };
    expect(namesake(oneWord, suggestion("Museo do Prado"))).toBe(false);
    expect(
      keepSuggestion(suggestion("Museo do Prado"), {
        ...context,
        taken: [oneWord],
      }),
    ).toBe(true);
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

describe("saveWhy", () => {
  const itemId = "items|1" as Id<"items">;
  const place: PlanPlace = {
    name: "Santa Joana",
    why: "A curated list of top-rated Lisbon eateries",
    itemId,
  };
  const source = (fields: Partial<PlanSource>): PlanSource => ({
    itemId,
    description: "A curated list of top-rated Lisbon eateries",
    places: ["Santa Joana"],
    ...fields,
  });

  it("keeps a single-place save's own reason", () => {
    expect(saveWhy(place, source({ title: "Santa Joana review" }))).toBe(
      place.why,
    );
    expect(
      saveWhy(
        place,
        source({ places: ["Santa Joana", "Santa Joana, Lisbon"] }),
      ),
    ).toBe(place.why);
    expect(saveWhy(place, undefined)).toBe(place.why);
  });

  it("names a guide by its title, not its description, for each of its places", () => {
    const guide = source({
      title: "The best restaurants in Lisbon",
      siteName: "Condé Nast Traveler",
      places: ["Santa Joana", "Prado", "Taberna da Rua das Flores, Lisbon"],
    });
    expect(saveWhy(place, guide)).toBe("The best restaurants in Lisbon");
    expect(saveWhy(place, { ...guide, title: undefined })).toBe(
      "Condé Nast Traveler",
    );
    expect(
      saveWhy(place, { ...guide, title: "  ", siteName: undefined }),
    ).toBeUndefined();
    const long = saveWhy(place, { ...guide, title: "word ".repeat(60) });
    expect(long).toHaveLength(140);
    expect(long?.endsWith("…")).toBe(true);
  });
});

describe("spreadSaves", () => {
  const itemId = "items|1" as Id<"items">;
  const at = (
    source: PlannedStop["source"],
    name: string,
    lat: number,
  ): PlannedStop => ({
    source,
    name,
    lat,
    lng: -9.14,
    ...(source === "save" ? { itemId } : {}),
  });
  const counts = (days: PlannedStop[][]) =>
    days.map((day) => day.filter((s) => s.source === "save").length);

  it("moves the nearest spare save to a short day and swaps a suggestion back", () => {
    const days = [
      [
        at("save", "N1", 38.8),
        at("save", "N2", 38.801),
        at("save", "N3", 38.802),
        at("save", "N4", 38.803),
        at("suggested", "N5", 38.804),
      ],
      [
        at("save", "M1", 38.75),
        at("save", "M2", 38.751),
        at("save", "M3", 38.752),
        at("suggested", "M4", 38.753),
        at("suggested", "M5", 38.754),
      ],
      [
        at("save", "S1", 38.7),
        at("suggested", "S2", 38.701),
        at("suggested", "S3", 38.702),
        at("suggested", "S4", 38.703),
        at("suggested", "S5", 38.704),
      ],
    ];
    const spread = spreadSaves(days);
    expect(counts(spread)).toEqual([4, 2, 2]);
    expect(spread.map((day) => day.length)).toEqual([5, 5, 5]);
    // The middle day is nearer the south than the north, so it gives the save.
    expect(spread[2].map((s) => s.name)).toContain("M1");
    expect(spread[1].map((s) => s.name)).toContain("S5");
    expect(counts(days)).toEqual([4, 3, 1]);
  });

  it("leaves days alone with fewer saves than days, or already even", () => {
    const few = [
      [at("save", "A", 38.8), at("suggested", "B", 38.8)],
      [at("suggested", "C", 38.7)],
    ];
    expect(spreadSaves([...few, []])).toEqual([...few, []]);
    const even = [[at("save", "A", 38.8)], [at("save", "B", 38.7)]];
    expect(spreadSaves(even)).toEqual(even);
  });

  it("fills an empty day from the day with the most saves", () => {
    const spread = spreadSaves([
      [at("save", "A", 38.8), at("save", "B", 38.8)],
      [at("save", "C", 38.7), at("save", "D", 38.7), at("save", "E", 38.7)],
      [],
    ]);
    expect(counts(spread)).toEqual([2, 2, 1]);
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

  it("orders the day as a walking route, then gives slots that agree with it", () => {
    // The day used to run in slot order (cafe, lunch, afternoon, dinner, bar) whatever the
    // map said; now it walks the shortest way from the cafe to the bar, and only slots
    // consistent with that order are kept.
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
      ["Meal 3", "lunch"],
      ["Meal 2", undefined],
      ["Museum", undefined],
      ["Meal 1", "dinner"],
      ["Bar", "evening"],
    ]);
  });

  it("drops slots the route contradicts (a second cafe, a bar before the end) and recomputes a stale one", () => {
    const trip = layoutTripPlan(
      [
        stop("Bakery", 38.7, { category: "Bakery" }),
        stop("Cafe", 38.7001, { category: "Cafe" }),
        stop("Bar", 38.7002, { category: "Nightlife" }),
        stop("Winery", 38.7003, { category: "Winery" }),
        stop("Meal", 38.7004, { category: "Restaurant", slot: "lunch" }),
      ],
      { days: 1, pace: "balanced" },
    );
    expect(trip.days[0].map((s) => [s.name, s.slot])).toEqual([
      ["Bakery", "morning"],
      ["Cafe", undefined],
      ["Bar", undefined],
      ["Meal", "dinner"],
      ["Winery", "evening"],
    ]);
  });

  it("spreads saves so no day is all suggestions", () => {
    const saves = Array.from({ length: 9 }, (_, i) =>
      stop(`Save ${i}`, 38.8 + i * 0.001, { source: "save", itemId }),
    );
    const suggested = Array.from({ length: 6 }, (_, i) =>
      stop(`Suggested ${i}`, 38.7 + i * 0.001),
    );
    const trip = layoutTripPlan([...saves, ...suggested], {
      days: 3,
      pace: "balanced",
    });
    const savesPerDay = trip.days.map(
      (day) => day.filter((s) => s.source === "save").length,
    );
    expect(savesPerDay.every((n) => n >= 3)).toBe(true);
    expect(trip.days.map((day) => day.length)).toEqual([5, 5, 5]);
    expect(trip.unplanned).toEqual([]);
  });

  it("keeps empty days when there are fewer stops than days", () => {
    const trip = layoutTripPlan([stop("Only", 38.7)], {
      days: 3,
      pace: "balanced",
    });
    expect(trip.days.map((d) => d.length)).toEqual([1, 0, 0]);
  });
});

describe("routeOrder", () => {
  const at = (
    name: string,
    lat: number,
    lng: number,
    category?: string,
  ): PlannedStop => ({
    source: "suggested",
    name,
    lat,
    lng,
    ...(category !== undefined ? { category } : {}),
  });

  // Planar enough over a few km: longitude scaled to the latitude.
  const xy = (p: PlannedStop) => [
    p.lng * Math.cos((p.lat * Math.PI) / 180),
    p.lat,
  ];
  const turn = (a: number[], b: number[], c: number[]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  function crossings(route: PlannedStop[]): number {
    let count = 0;
    for (let i = 0; i + 1 < route.length; i++) {
      for (let j = i + 2; j + 1 < route.length; j++) {
        const [a, b, c, d] = [
          route[i],
          route[i + 1],
          route[j],
          route[j + 1],
        ].map(xy);
        if (
          turn(a, b, c) * turn(a, b, d) < 0 &&
          turn(c, d, a) * turn(c, d, b) < 0
        )
          count++;
      }
    }
    return count;
  }
  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(
        (rest) => [item, ...rest],
      ),
    );
  }
  const shortest = (orders: PlannedStop[][]) =>
    Math.min(...orders.map(routeKm));

  it("uncrosses a square visited corner to opposite corner", () => {
    const square = [
      at("South west", 38.71, -9.15),
      at("North east", 38.72, -9.137),
      at("South east", 38.71, -9.137),
      at("North west", 38.72, -9.15),
    ];
    expect(crossings(square)).toBe(1);
    const route = routeOrder(square);
    expect(route.map((s) => s.name).sort()).toEqual(
      square.map((s) => s.name).sort(),
    );
    expect(crossings(route)).toBe(0);
    expect(routeKm(route)).toBeCloseTo(shortest(permutations(square)), 9);
  });

  it("starts at the morning stop and ends at the evening stop, shortest between them", () => {
    const stops = [
      at("Museum", 38.71, -9.15),
      at("Bar", 38.715, -9.143, "Nightlife"),
      at("Park", 38.72, -9.137),
      at("Cafe", 38.7155, -9.1435, "Cafe"),
      at("Market", 38.71, -9.137),
      at("Gallery", 38.72, -9.15),
    ];
    const route = routeOrder(stops);
    expect(route[0].name).toBe("Cafe");
    expect(route[route.length - 1].name).toBe("Bar");
    const cafe = stops[3];
    const bar = stops[1];
    const middle = stops.filter((s) => s !== cafe && s !== bar);
    expect(routeKm(route)).toBeCloseTo(
      shortest(permutations(middle).map((order) => [cafe, ...order, bar])),
      9,
    );
    expect(crossings(route)).toBe(0);
  });

  it("leaves one-stop and two-stop days in their order", () => {
    const one = [at("Only", 38.71, -9.14)];
    expect(routeOrder(one)).toEqual(one);
    const two = [at("Far", 38.75, -9.1), at("Near", 38.71, -9.14)];
    expect(routeOrder(two)).toEqual(two);
  });

  it("gives the same uncrossed route for the same day every time", () => {
    // A fixed scatter of seven stops across central Lisbon.
    const stops = [
      [38.7139, -9.1334],
      [38.7071, -9.1355],
      [38.7223, -9.1393],
      [38.7097, -9.1428],
      [38.7169, -9.1399],
      [38.7036, -9.1366],
      [38.7114, -9.126],
    ].map(([lat, lng], i) => at(`Stop ${i}`, lat, lng));
    const first = routeOrder(stops);
    expect(routeOrder(stops)).toEqual(first);
    expect(routeOrder([...stops])).toEqual(first);
    expect(crossings(first)).toBe(0);
    expect(routeKm(first)).toBeLessThanOrEqual(routeKm(stops));
  });
});

describe("merging saved namesakes", () => {
  const itemId = "item1" as Id<"items">;
  const restaurant = {
    source: "save" as const,
    itemId,
    name: "Santa Joana",
    lat: 38.7546,
    lng: -9.1365,
  };
  const hotel = {
    source: "save" as const,
    itemId,
    name: "Locke de Santa Joana",
    lat: 38.7254,
    lng: -9.1477,
    appleId: "hotel",
    category: "Hotel",
  };

  it("keeps the venue once, under the name that isn't lodging, at the matched pin", () => {
    for (const order of [
      [restaurant, hotel],
      [hotel, restaurant],
    ]) {
      expect(mergeSavedNamesakes(order)).toEqual([
        { ...restaurant, lat: hotel.lat, lng: hotel.lng },
      ]);
    }
  });

  it("leaves different venues and one-word names alone", () => {
    const prado = { ...restaurant, name: "Prado", lat: 38.71, lng: -9.13 };
    const pradoBar = { ...hotel, name: "Prado Bar", category: "Nightlife" };
    expect(mergeSavedNamesakes([restaurant, prado, pradoBar])).toEqual([
      restaurant,
      prado,
      pradoBar,
    ]);
  });
});
