import { describe, expect, it } from "vitest";
import {
  followMovedPins,
  keptPlaces,
  REVEAL_MAX_WAIT_MS,
  REVEAL_PIN_GRACE_MS,
  revealFor,
  type RevealSave,
} from "@/lib/spots-reveal";

const pin = (name: string, city?: string) => ({
  name,
  lat: 30.27,
  lng: -97.74,
  ...(city ? { city } : {}),
});

const save = (over: Partial<RevealSave> = {}): RevealSave => ({
  _id: "item-1",
  status: "processing",
  ...over,
});

describe("revealFor", () => {
  it("keeps finding while the save loads or reads", () => {
    expect(revealFor(undefined, 1_000, 0)).toEqual({ kind: "finding" });
    expect(revealFor(save(), 5_000, 0)).toEqual({ kind: "finding" });
  });

  it("drops the spots in the city most pins share", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Austin", "Dallas"],
        placePins: [
          pin("Odd Duck", "Austin"),
          pin("Uchi", "austin"),
          pin("Pecan Lodge", "Dallas"),
          pin("Loro"),
        ],
      }),
      7_000,
      1_000,
    );
    expect(reveal).toEqual({
      kind: "spots",
      city: "Austin",
      pins: [pin("Odd Duck", "Austin"), pin("Uchi", "austin")],
    });
  });

  it("leaves out bare street addresses pinned on top of named spots", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Austin"],
        placePins: [
          pin("Craft Omakase", "Austin"),
          pin("4400 N Lamar Blvd Suite 102, Austin, TX 78756", "Austin"),
        ],
      }),
      7_000,
      0,
    );
    expect(reveal).toEqual({
      kind: "spots",
      city: "Austin",
      pins: [pin("Craft Omakase", "Austin")],
    });
  });

  it("keeps unlabelled pins out of a multi-city save, as the city page does", () => {
    const multi = save({
      cities: ["Austin", "Dallas"],
      status: "ready",
      placePins: [pin("Loro"), pin("Uchi")],
    });
    expect(revealFor(multi, 7_000, 1_000)).toEqual({ kind: "finding" });
  });

  it("waits for a pinned list save to settle before dropping its spots", () => {
    const pinned = save({
      cities: ["Austin"],
      placePins: [pin("Uchi", "Austin")],
    });
    expect(revealFor(pinned, 3_000, 0)).toEqual({ kind: "finding" });
  });

  it("never shows a save whose only pins are street addresses", () => {
    const addresses = save({
      status: "ready",
      cities: ["Austin"],
      placePins: [pin("3108 Windsor Road, Austin, TX 78703", "Austin")],
    });
    expect(revealFor(addresses, 20_000, REVEAL_PIN_GRACE_MS)).toEqual({
      kind: "none",
      reason: "no_place",
    });
  });

  it("names the save's own city when its pins carry none", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Chicago"],
        placePins: [pin("Au Cheval")],
      }),
      7_000,
      0,
    );
    expect(reveal).toMatchObject({ kind: "spots", city: "Chicago" });
  });

  it("waits a short grace for pins after a ready save with a city", () => {
    const ready = save({ status: "ready", cities: ["Austin"] });
    expect(revealFor(ready, 8_000, REVEAL_PIN_GRACE_MS - 1)).toEqual({
      kind: "finding",
    });
    expect(revealFor(ready, 16_000, REVEAL_PIN_GRACE_MS)).toEqual({
      kind: "none",
      reason: "no_place",
    });
  });

  it("goes Home at once when the save has no place or failed", () => {
    expect(revealFor(save({ status: "ready", cities: [] }), 6_000, 0)).toEqual({
      kind: "none",
      reason: "no_place",
    });
    expect(revealFor(save({ status: "failed" }), 3_000, 0)).toEqual({
      kind: "none",
      reason: "failed",
    });
    expect(revealFor(null, 0, 0)).toEqual({ kind: "none", reason: "missing" });
  });

  it("gives up after the longest wait", () => {
    expect(revealFor(save(), REVEAL_MAX_WAIT_MS, 0)).toEqual({
      kind: "none",
      reason: "timeout",
    });
  });

  it("gives a save that turns ready late its full pin grace", () => {
    const late = save({ status: "ready", cities: ["Austin"] });
    expect(revealFor(late, REVEAL_MAX_WAIT_MS + 1_000, 5_000)).toEqual({
      kind: "finding",
    });
    expect(revealFor(late, REVEAL_MAX_WAIT_MS + 6_000, 10_000)).toEqual({
      kind: "none",
      reason: "no_place",
    });
  });
});

describe("keptPlaces", () => {
  const taco = { name: "Taco Bar", lat: 30.27, lng: -97.74, city: "Austin" };
  const cafe = { name: "Cafe", lat: 30.28, lng: -97.75, appleId: "apple-1" };
  const listed = [
    { ...taco, category: "restaurant" },
    { ...cafe, city: "Austin", name: "Cafe (renamed by Apple)" },
    { name: "Bakery", city: "Austin" },
  ];

  it("drops only the removed spots and leaves every other entry untouched, in order", () => {
    expect(keptPlaces(listed, [taco])).toEqual([listed[1], listed[2]]);
  });
  it("matches by Apple id when both sides have one", () => {
    expect(keptPlaces(listed, [cafe])).toEqual([listed[0], listed[2]]);
  });
  it("keeps a namesake at other coordinates", () => {
    expect(keptPlaces(listed, [{ ...taco, lat: 31 }])).toEqual(listed);
  });
  it("drops an unpinned label for the removed spot, but not another branch", () => {
    const joes = { name: "Joe's, Carmine St", lat: 40.73, lng: -74.0 };
    const places = [
      taco,
      { name: "taco bar, East Austin", city: "Austin" },
      { name: "Taco Barn" },
      joes,
      { name: "Joe's, Broadway" },
      { name: "Joe's, Carmine St" },
    ];
    expect(keptPlaces(places, [taco, joes])).toEqual([places[2], places[4]]);
  });
  it("keeps branch labels a removed pin without an area cannot tell apart", () => {
    const joes = { name: "Joe's", lat: 40.73, lng: -74.0, city: "New York" };
    const carmine = { name: "Joe's, Carmine St", city: "New York" };
    const broadway = { name: "Joe's, Broadway, New York", city: "New York" };
    const bare = { name: "Joe's", city: "New York" };
    expect(keptPlaces([joes, carmine, broadway, bare], [joes])).toEqual([
      carmine,
      broadway,
    ]);
    expect(keptPlaces([joes, carmine, bare], [joes])).toEqual([]);
  });
  it("keeps a namesake label in another city of a multi-city save", () => {
    const places = [taco, { name: "Taco Bar, Dallas" }];
    expect(keptPlaces(places, [taco])).toEqual([places[1]]);
  });
  it("reads a label's trailing city apart from its area", () => {
    const branch = {
      name: "Tigre, Alfama",
      lat: 38.71,
      lng: -9.13,
      city: "Lisbon",
    };
    const bare = { name: "Tigre", lat: 38.72, lng: -9.14, city: "Lisbon" };
    const places = [
      { name: "Tigre, Alfama, Lisbon" },
      { name: "Tigre, Alfama, Porto" },
      { name: "Tigre, Baixa" },
    ];
    expect(keptPlaces(places, [branch])).toEqual([places[1], places[2]]);
    expect(keptPlaces(places, [bare])).toEqual([places[1], places[2]]);
  });
  it("drops a label naming the removed spot's city in a multi-city save", () => {
    const places = [taco, { name: "Taco Bar, Austin" }, { name: "Taco Bar" }];
    expect(keptPlaces(places, [taco])).toEqual([places[2]]);
  });
});

describe("followMovedPins", () => {
  const uchi = { name: "Uchi", lat: 30.26, lng: -97.75 };
  it("moves a staged pin onto its refreshed point, but never onto a pin it did not become", () => {
    const moved = { ...uchi, lat: 30.26001 };
    const existing = { ...uchi, lat: 30.2601 };
    const otherVenue = { ...uchi, lat: 30.2602, appleId: "venue-b" };
    const staged = { ...uchi, otherVenues: ["venue-b"] };
    followMovedPins([staged], [existing, otherVenue], [existing]);
    expect(staged).toMatchObject({ lat: 30.26 });
    followMovedPins([staged], [existing, moved], [existing]);
    expect(staged).toMatchObject({ lat: 30.26001 });
  });
});
