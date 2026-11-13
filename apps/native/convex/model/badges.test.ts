import { describe, expect, it } from "vitest";

import {
  BADGES,
  type BadgeCity,
  type BadgeId,
  type BadgeStamp,
  badgeStates,
  badgeTotals,
  cityComplete,
  earnedBadges,
  newlyEarned,
  nextBadge,
} from "./badges";
import { placeKinds } from "./placeKinds";

function stamps(count: number, stamp: Partial<BadgeStamp> = {}): BadgeStamp[] {
  return Array.from({ length: count }, () => ({ kinds: [], ...stamp }));
}

function inCities(count: number): BadgeStamp[] {
  return Array.from({ length: count }, (_, index) => ({
    city: `City ${index}`,
    kinds: [],
  }));
}

function inCountries(count: number): BadgeStamp[] {
  return Array.from({ length: count }, (_, index) => ({
    city: "Somewhere",
    countryCode: `C${index}`,
    kinds: [],
  }));
}

function earned(list: BadgeStamp[], cities: BadgeCity[] = []): BadgeId[] {
  return earnedBadges(badgeTotals(list, cities));
}

const GOAL = Object.fromEntries(BADGES.map((badge) => [badge.id, badge.goal]));

describe("badge thresholds", () => {
  const cases: [BadgeId, (count: number) => BadgeStamp[]][] = [
    ["firstStamp", (count) => stamps(count)],
    ["explorer", (count) => stamps(count)],
    ["wanderer", (count) => stamps(count)],
    ["globetrotter", (count) => stamps(count)],
    ["cityHopper", inCities],
    ["passportHolder", inCountries],
    ["coffeeCrawler", (count) => stamps(count, { kinds: ["coffee"] })],
    ["foodie", (count) => stamps(count, { kinds: ["food"] })],
    ["sweetTooth", (count) => stamps(count, { kinds: ["dessert"] })],
    ["nightOwl", (count) => stamps(count, { kinds: ["drinks"] })],
    ["outAndAbout", (count) => stamps(count, { kinds: ["activities"] })],
  ];

  it.each(cases)("%s unlocks exactly at its goal", (id, build) => {
    const goal = GOAL[id] ?? 0;
    expect(earned(build(goal - 1))).not.toContain(id);
    expect(earned(build(goal))).toContain(id);
    expect(earned(build(goal + 1))).toContain(id);
  });

  it("keeps the goals Ashish approved", () => {
    expect(GOAL).toEqual({
      firstStamp: 1,
      explorer: 10,
      wanderer: 50,
      globetrotter: 150,
      cityHopper: 5,
      passportHolder: 3,
      completionist: 1,
      coffeeCrawler: 5,
      foodie: 15,
      sweetTooth: 5,
      nightOwl: 5,
      outAndAbout: 5,
    });
  });
});

describe("place tiers", () => {
  it.each([
    [0, []],
    [1, ["firstStamp"]],
    [9, ["firstStamp"]],
    [10, ["firstStamp", "explorer"]],
    [49, ["firstStamp", "explorer"]],
    [50, ["firstStamp", "explorer", "wanderer"]],
    [149, ["firstStamp", "explorer", "wanderer"]],
    [150, ["firstStamp", "explorer", "wanderer", "globetrotter"]],
  ])("%i places earn %j", (count, ids) => {
    expect(earned(stamps(count))).toEqual(ids);
  });

  it("offers only the lowest unearned tier as next", () => {
    expect(nextBadge(badgeTotals(stamps(12), []))?.badge.id).not.toBe(
      "globetrotter",
    );
    const onlyPlaces = badgeStates(badgeTotals(stamps(12), [])).filter(
      (state) => state.badge.measure === "places" && !state.earned,
    );
    expect(onlyPlaces.map((state) => state.badge.id)).toEqual([
      "wanderer",
      "globetrotter",
    ]);
  });
});

describe("counts", () => {
  it("counts a city once whatever its case", () => {
    const list: BadgeStamp[] = [
      { city: "Lisbon", kinds: [] },
      { city: "lisbon", kinds: [] },
      { city: "Porto", kinds: [] },
      { kinds: [] },
    ];
    expect(badgeTotals(list, []).cities).toBe(2);
    expect(badgeTotals(list, []).places).toBe(4);
  });

  it("counts no country until one is known", () => {
    expect(badgeTotals(inCities(4), []).countries).toBe(0);
    expect(
      badgeTotals(
        [...inCountries(2), { city: "Lisbon", countryCode: "C0", kinds: [] }],
        [],
      ).countries,
    ).toBe(2);
  });
});

describe("categories", () => {
  it("reads each kind from placeKinds", () => {
    const list: BadgeStamp[] = [
      { kinds: placeKinds("Cafe", []) },
      { kinds: placeKinds("Restaurant", ["coffee"]) },
      { kinds: placeKinds("Bakery", []) },
      { kinds: placeKinds("Nightlife", []) },
      { kinds: placeKinds("Museum", []) },
      { kinds: placeKinds(undefined, ["ramen"]) },
    ];
    expect(badgeTotals(list, [])).toMatchObject({
      coffee: 2,
      food: 2,
      dessert: 1,
      drinks: 1,
      activities: 1,
    });
  });

  it("counts a place with two kinds toward both", () => {
    const totals = badgeTotals(stamps(5, { kinds: ["food", "coffee"] }), []);
    expect(totals.food).toBe(5);
    expect(earnedBadges(totals)).toContain("coffeeCrawler");
  });

  it("counts a place with no kind only toward count badges", () => {
    const totals = badgeTotals(stamps(10), []);
    expect(totals).toMatchObject({
      places: 10,
      coffee: 0,
      food: 0,
      dessert: 0,
      drinks: 0,
      activities: 0,
    });
    expect(earnedBadges(totals)).toEqual(["firstStamp", "explorer"]);
  });

  it("counts no badge for date night, shopping or a stay", () => {
    const totals = badgeTotals(
      stamps(15, { kinds: ["dateNight", "shopping", "stay"] }),
      [],
    );
    expect(earnedBadges(totals)).toEqual(["firstStamp", "explorer"]);
  });
});

describe("completionist", () => {
  it.each([
    [[], false],
    [[{ stamped: 2, total: 3 }], false],
    [[{ stamped: 0, total: 0 }], false],
    [[{ stamped: 3, total: 3 }], true],
    [[{ stamped: 4, total: 3 }], true],
    [
      [
        { stamped: 1, total: 3 },
        { stamped: 2, total: 2 },
      ],
      true,
    ],
  ])("cities %j earn it: %s", (cities, expected) => {
    expect(earned(stamps(1), cities).includes("completionist")).toBe(expected);
  });

  it("matches a full ring", () => {
    expect(cityComplete({ stamped: 3, total: 3 })).toBe(true);
    expect(cityComplete({ stamped: 0, total: 0 })).toBe(false);
  });
});

describe("relocking", () => {
  it("takes a badge back when a stamp comes off", () => {
    const before = earned(stamps(5, { kinds: ["coffee"] }));
    const after = earned(stamps(4, { kinds: ["coffee"] }));
    expect(before).toContain("coffeeCrawler");
    expect(after).not.toContain("coffeeCrawler");
    expect(newlyEarned(before, after)).toEqual([]);
  });

  it("takes Completionist back when a city's ring stops being full", () => {
    expect(earned(stamps(3), [{ stamped: 2, total: 3 }])).not.toContain(
      "completionist",
    );
  });
});

describe("newlyEarned", () => {
  it("lists badges earned after a stamp in table order", () => {
    const before = earned(stamps(9, { kinds: ["coffee"] }));
    const after = earned(stamps(10, { kinds: ["coffee"] }));
    expect(newlyEarned(before, after)).toEqual(["explorer"]);
    expect(newlyEarned([], ["firstStamp", "coffeeCrawler"])).toEqual([
      "firstStamp",
      "coffeeCrawler",
    ]);
  });
});

describe("nextBadge", () => {
  it("starts at the first stamp", () => {
    expect(nextBadge(badgeTotals([], []))).toEqual({
      badge: BADGES[0],
      have: 0,
      earned: false,
    });
  });

  it("picks the closest badge and reports progress", () => {
    const next = nextBadge(badgeTotals(stamps(3, { kinds: ["coffee"] }), []));
    expect(next?.badge.id).toBe("coffeeCrawler");
    expect(next?.have).toBe(3);
  });

  it("breaks a tie in table order", () => {
    const next = nextBadge(
      badgeTotals(stamps(1, { kinds: ["dessert", "drinks"] }), []),
    );
    expect(next?.badge.id).toBe("sweetTooth");
  });

  it("is null once every badge is earned", () => {
    const all: BadgeStamp[] = [
      ...inCountries(3),
      ...inCities(5),
      ...stamps(150, {
        kinds: ["coffee", "food", "dessert", "drinks", "activities"],
      }),
    ];
    expect(nextBadge(badgeTotals(all, [{ stamped: 1, total: 1 }]))).toBe(null);
  });
});
