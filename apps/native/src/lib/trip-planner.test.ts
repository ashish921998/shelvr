import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanStop } from "@convex/model/tripPlan";

import {
  cityChoices,
  clampDays,
  dayAtScroll,
  dayColor,
  dayScrollOffset,
  DEFAULT_INTERESTS,
  firstFocusDay,
  initialTripForm,
  newestFirst,
  paceHint,
  pinDay,
  planPins,
  REVEAL_STEPS,
  revealDelay,
  scrolledToEnd,
  sharedSaveStops,
  stopAction,
  stopBadge,
  toggleInterest,
  tripDateRange,
  tripBackTitle,
  tripCardLine,
  tripDayLabel,
  tripFormArgs,
  tripFormProblem,
  tripLengthLine,
  tripPlanFailure,
  tripPlanMessage,
  tripStopsLine,
  tripTitle,
} from "./trip-planner";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function stop(fields: Partial<TripPlanStop> = {}): TripPlanStop {
  return {
    _id: "stop1" as Id<"tripStops">,
    source: "suggested",
    name: "Miradouro da Graça",
    lat: 38.7167,
    lng: -9.1314,
    ...fields,
  };
}

describe("interests", () => {
  it("starts on a sensible set and keeps the chips' order when toggled", () => {
    expect(initialTripForm().interests).toEqual(DEFAULT_INTERESTS);
    expect(toggleInterest(["sights", "food"], "coffee")).toEqual([
      "food",
      "coffee",
      "sights",
    ]);
    expect(toggleInterest(["food", "coffee"], "food")).toEqual(["coffee"]);
  });

  it("never turns off the last interest", () => {
    expect(toggleInterest(["drinks"], "drinks")).toEqual(["drinks"]);
  });
});

describe("tripFormArgs", () => {
  const form = initialTripForm("  Lisbon  ");

  it("tidies the city and stay and sends only what was given", () => {
    const result = tripFormArgs(
      { ...form, stay: "  Bairro   Alto ", days: 4, pace: "packed" },
      "pt-BR",
    );
    expect(result).toEqual({
      ok: true,
      args: {
        city: "Lisbon",
        days: 4,
        pace: "packed",
        interests: ["food", "coffee", "sights"],
        stay: "Bairro Alto",
        locale: "pt-BR",
      },
    });
  });

  it("sends a chosen start date as a calendar day", () => {
    const result = tripFormArgs(
      { ...form, startDate: new Date(2026, 10, 4, 15, 30) },
      "en",
    );
    expect(result.ok && result.args.startDate).toBe("2026-11-04");
  });

  it("asks for a city before planning", () => {
    expect(tripFormArgs({ ...form, city: "   " }, "en")).toEqual({
      ok: false,
      problem: "city",
    });
  });

  it("asks for an interest before planning", () => {
    expect(tripFormArgs({ ...form, interests: [] }, "en")).toEqual({
      ok: false,
      problem: "interests",
    });
  });

  it("keeps the submit button off until a city is in", () => {
    expect(tripFormProblem(initialTripForm())).toBe("city");
    expect(tripFormProblem({ ...form, city: "  " })).toBe("city");
    expect(tripFormProblem({ ...form, interests: [] })).toBe("interests");
    expect(tripFormProblem(form)).toBeNull();
  });

  it("keeps the trip length inside what the planner accepts", () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(40)).toBe(15);
    expect(clampDays(2.6)).toBe(3);
    expect(clampDays(Number.NaN)).toBe(3);
  });
});

describe("cityChoices", () => {
  it("lists the most saved cities first and drops empty ones", () => {
    expect(
      cityChoices([
        { city: "Porto", count: 2 },
        { city: "Lisbon", count: 9 },
        { city: "Braga", count: 2 },
        { city: " ", count: 4 },
        { city: "Faro", count: 0 },
      ]),
    ).toEqual([
      { city: "Lisbon", count: 9 },
      { city: "Braga", count: 2 },
      { city: "Porto", count: 2 },
    ]);
  });
});

describe("trip lines", () => {
  it("titles a trip by its city", () => {
    expect(tripTitle("Lisbon")).toBe("Lisbon trip");
  });

  it("shows the length alone, or with its dates", () => {
    expect(tripLengthLine({ dayCount: 3 })).toBe("3 days");
    expect(tripLengthLine({ dayCount: 1, startDate: "2026-11-04" })).toBe(
      "1 day · Nov 4",
    );
    expect(tripLengthLine({ dayCount: 3, startDate: "2026-11-04" })).toBe(
      "3 days · Nov 4 – Nov 6",
    );
  });

  it("ignores a start date it cannot read", () => {
    expect(tripDateRange("soon", 3)).toBeNull();
    expect(tripDateRange(undefined, 3)).toBeNull();
  });

  it("tells same-city trips apart on their cards by when they were planned", () => {
    const createdAt = new Date(2026, 9, 27, 15).getTime();
    expect(tripCardLine({ dayCount: 3, createdAt })).toBe(
      "3 days · Planned Oct 27",
    );
    expect(tripCardLine({ dayCount: 3, startDate: "soon", createdAt })).toBe(
      "3 days · Planned Oct 27",
    );
    expect(
      tripCardLine({ dayCount: 3, startDate: "2026-11-04", createdAt }),
    ).toBe("3 days · Nov 4 – Nov 6");
  });

  it("counts stops and how many came from the person's saves", () => {
    expect(tripStopsLine({ stopCount: 8, savedCount: 5 })).toBe(
      "8 stops · 5 from your saves",
    );
    expect(tripStopsLine({ stopCount: 1, savedCount: 0 })).toBe("1 stop");
  });

  it("labels a day with its date when the trip has one", () => {
    expect(tripDayLabel(0, undefined)).toBe("Day 1");
    expect(tripDayLabel(1, "2026-11-04")).toBe("Day 2 · Thu, Nov 5");
  });

  it("describes the pace in stops a day", () => {
    expect(paceHint("easy")).toBe("About 3 stops a day");
  });

  it("puts the newest trip first", () => {
    expect(
      newestFirst([
        { _id: "a", createdAt: 1 },
        { _id: "b", createdAt: 3 },
        { _id: "c", createdAt: 2 },
      ]).map((trip) => trip._id),
    ).toEqual(["b", "c", "a"]);
  });
});

describe("stops", () => {
  it("badges saves and suggestions, not hand-added stops", () => {
    expect(stopBadge("save")).toBe("tripPlanner.badgeYours");
    expect(stopBadge("suggested")).toBe("tripPlanner.badgeSuggested");
    expect(stopBadge("added")).toBeNull();
  });

  it("opens a save from the person's shelf", () => {
    const itemId = "item1" as Id<"items">;
    expect(
      stopAction(stop({ source: "save", itemId, appleId: "I1" }), true),
    ).toEqual({ kind: "save", itemId });
  });

  it("opens Apple's place card for a suggestion that has one", () => {
    expect(stopAction(stop({ appleId: "I1" }), true)).toEqual({
      kind: "card",
      appleId: "I1",
    });
  });

  it("falls back to Maps by coordinates when no card can show", () => {
    platform.OS = "ios";
    expect(stopAction(stop({ appleId: "I1" }), false)).toEqual({
      kind: "maps",
      url: "https://maps.apple.com/?ll=38.7167,-9.1314&q=Miradouro%20da%20Gra%C3%A7a",
    });
    platform.OS = "android";
    expect(stopAction(stop(), false)).toEqual({
      kind: "maps",
      url: "https://www.google.com/maps/search/?api=1&query=38.7167%2C-9.1314",
    });
    platform.OS = "ios";
  });

  it("numbers pins within each day and fades the days out of focus", () => {
    const pins = planPins(
      [[stop(), stop({ name: "Tasca" })], [stop({ name: "LX Factory" })]],
      1,
    );
    expect(
      pins.map((pin) => [pin.id, pin.number, pin.active, pin.text, pin.title]),
    ).toEqual([
      ["0:0", 1, false, "", ""],
      ["0:1", 2, false, "", ""],
      ["1:0", 1, true, "1", "LX Factory"],
    ]);
    expect(planPins([[stop()]], null)[0]?.active).toBe(true);
    expect(pinDay("1:0")).toBe(1);
    expect(pinDay("stay")).toBeNull();
    expect(pinDay(undefined)).toBeNull();
  });
});

describe("trip page focus", () => {
  it("labels every pin with its day when the whole trip shows", () => {
    const pins = planPins(
      [[stop(), stop({ name: "Tasca" })], [stop({ name: "LX Factory" })]],
      null,
    );
    expect(pins.map((pin) => [pin.text, pin.title, pin.active])).toEqual([
      ["1", "Miradouro da Graça", true],
      ["1", "Tasca", true],
      ["2", "LX Factory", true],
    ]);
  });

  it("gives every pin a spoken label with its day, stop and name, faded or not", () => {
    const pins = planPins(
      [[stop(), stop({ name: "Tasca" })], [stop({ name: "Prado" })]],
      0,
    );
    expect(pins.map((pin) => pin.label)).toEqual([
      "Day 1, stop 1, Miradouro da Graça",
      "Day 1, stop 2, Tasca",
      "Day 2, stop 1, Prado",
    ]);
    expect(pins[2]?.title).toBe("");
  });

  it("colours each day from the palette, cycling once a trip outruns it", () => {
    const palette = ["#a", "#b", "#c"] as const;
    expect([0, 1, 2, 3, 4, 7].map((day) => dayColor(day, palette))).toEqual([
      "#a",
      "#b",
      "#c",
      "#a",
      "#b",
      "#b",
    ]);
    expect(dayColor(-1, palette)).toBe("#c");
    expect(dayColor(1.5, palette)).toBe("#a");
  });

  it("follows the list to the day whose header has reached the pinned map", () => {
    const tops = [400, 900, 1500];
    // Map and chips are 360 tall; a header counts once it is 16 under them.
    expect(dayAtScroll(0, 376, tops, false)).toBe(0);
    expect(dayAtScroll(523, 376, tops, false)).toBe(0);
    expect(dayAtScroll(524, 376, tops, false)).toBe(1);
    expect(dayAtScroll(1200, 376, tops, false)).toBe(2);
    // Scrolled to the end, the last day wins even if its header never reached the map.
    expect(dayAtScroll(700, 376, tops, true)).toBe(2);
  });

  it("follows only the days that have laid out", () => {
    expect(dayAtScroll(0, 376, [], false)).toBeNull();
    expect(dayAtScroll(0, 376, [undefined, 900], false)).toBe(1);
    expect(dayAtScroll(2000, 376, [400, undefined], true)).toBe(0);
  });

  it("lands a chip's scroll on the day the scroll-follow then reports", () => {
    const tops = [400, 900, 1500];
    const offset = dayScrollOffset(900, 360, 8);
    expect(dayAtScroll(offset, 360 + 16, tops, false)).toBe(1);
  });

  it("knows when the list is at its end", () => {
    expect(scrolledToEnd(1200, 800, 2000)).toBe(true);
    expect(scrolledToEnd(1199.5, 800, 2000)).toBe(true);
    expect(scrolledToEnd(1000, 800, 2000)).toBe(false);
    // A list shorter than the screen never scrolls, so it is never "at the end".
    expect(scrolledToEnd(0, 800, 600)).toBe(false);
  });

  it("opens on the first day with a stop, or the whole trip when none has one", () => {
    expect(firstFocusDay([[stop()], [stop()]])).toBe(0);
    expect(firstFocusDay([[], [stop()]])).toBe(1);
    expect(firstFocusDay([[], []])).toBeNull();
    expect(firstFocusDay([])).toBeNull();
  });

  it("scrolls a day's header to just under the pinned map, never above the top", () => {
    expect(dayScrollOffset(900, 360, 8)).toBe(532);
    expect(dayScrollOffset(300, 360, 8)).toBe(0);
  });

  it("marks stops whose why is the title of a save several stops share", () => {
    const itemId = "item1" as Id<"items">;
    const shared = sharedSaveStops([
      stop({ _id: "a" as Id<"tripStops">, itemId, why: "Best of Lisbon" }),
      stop({ _id: "b" as Id<"tripStops">, itemId, why: "Best of Lisbon" }),
      stop({
        _id: "c" as Id<"tripStops">,
        itemId: "item2" as Id<"items">,
        why: "Rich tonkotsu",
      }),
      stop({ _id: "d" as Id<"tripStops">, why: "Best of Lisbon" }),
      stop({ _id: "e" as Id<"tripStops">, why: "Best of Lisbon" }),
    ]);
    expect([...shared].sort()).toEqual(["a", "b"]);
  });

  it("titles the back button after the trips list it came from", () => {
    expect(tripBackTitle("(tabs)")).toBe("My trips");
    expect(tripBackTitle("city/[name]")).toBe("Back");
    expect(tripBackTitle(undefined)).toBe("Back");
  });
});

describe("failures", () => {
  it("tells a rate limit apart from other errors", () => {
    expect(
      tripPlanFailure(
        new ConvexError({ kind: "RateLimited", name: "createTripPlan" }),
      ),
    ).toBe("rate_limited");
    expect(
      tripPlanFailure(
        new ConvexError({ code: "pro_required", message: "Pro required" }),
      ),
    ).toBe("pro_required");
    expect(tripPlanFailure(new Error("offline"))).toBe("error");
  });

  it("explains each problem in copy", () => {
    expect(tripPlanMessage({ kind: "empty", city: "Lisbon" })).toContain(
      "Lisbon",
    );
    expect(tripPlanMessage({ kind: "city" })).toBe("Pick a city or type one.");
    expect(tripPlanMessage({ kind: "rate_limited" })).toMatch(/few minutes/);
  });
});

describe("revealDelay", () => {
  it("holds each line while planning and waits on the last", () => {
    expect(revealDelay(0, false)).toBeGreaterThan(1000);
    expect(revealDelay(REVEAL_STEPS.length - 1, false)).toBeNull();
  });

  it("ticks through quickly once the trip is ready", () => {
    expect(revealDelay(0, true)).toBeLessThan(500);
    expect(revealDelay(REVEAL_STEPS.length, true)).toBeLessThan(500);
  });
});
