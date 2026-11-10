import { describe, expect, it } from "vitest";

import { placeEmoji } from "./map-pin-emoji";

describe("placeEmoji", () => {
  it("draws Apple's category when the pin has one", () => {
    expect(placeEmoji({ category: "Restaurant", kinds: ["food"] })).toBe("🍽️");
    expect(placeEmoji({ category: "Nightlife", kinds: ["drinks"] })).toBe("🍸");
    expect(placeEmoji({ category: "Museum", kinds: ["activities"] })).toBe(
      "🏛️",
    );
    // Two "things to do" places still look different.
    expect(placeEmoji({ category: "Park", kinds: ["activities"] })).toBe("🌳");
    expect(placeEmoji({ category: "FitnessCenter", kinds: [] })).toBe("🏋️");
  });

  it("keeps the category over the save's tags", () => {
    expect(
      placeEmoji({ category: "Restaurant", kinds: ["food", "dessert"] }),
    ).toBe("🍽️");
  });

  it("falls back to the most specific kind without a known category", () => {
    expect(placeEmoji({ kinds: ["food", "coffee"] })).toBe("☕");
    expect(placeEmoji({ kinds: ["drinks", "dateNight"] })).toBe("🍸");
    expect(placeEmoji({ category: "Pharmacy", kinds: ["shopping"] })).toBe(
      "🛍️",
    );
  });

  it("leaves the plain pin when nothing says what the place is", () => {
    expect(placeEmoji({ kinds: [] })).toBeUndefined();
    expect(placeEmoji({ kinds: ["dateNight"] })).toBeUndefined();
    expect(placeEmoji({ category: "Pharmacy", kinds: [] })).toBeUndefined();
  });

  it("reads a food place's name when Apple only says Restaurant", () => {
    expect(
      placeEmoji({
        name: "P. Terry's Burger Stand",
        category: "Restaurant",
        kinds: ["food"],
      }),
    ).toBe("🍔");
    expect(placeEmoji({ name: "Veracruz All Natural", kinds: ["food"] })).toBe(
      "🍽️",
    );
    expect(placeEmoji({ name: "Taquería Arandas", kinds: [] })).toBe("🌮");
    expect(
      placeEmoji({ name: "Café Luna", category: "Restaurant", kinds: [] }),
    ).toBe("☕");
    expect(placeEmoji({ name: "Phở Saigon", kinds: [] })).toBe("🍜");
    expect(placeEmoji({ name: "Lick Honest Ice Creams", kinds: [] })).toBe(
      "🍨",
    );
  });

  it("keeps a specific category over the name", () => {
    expect(
      placeEmoji({ name: "Pizza Museum", category: "Museum", kinds: [] }),
    ).toBe("🏛️");
  });

  it("ignores the name under a category it has no emoji for", () => {
    expect(
      placeEmoji({
        name: "Indian Creek Golf Club",
        category: "GolfCourse",
        kinds: ["activities"],
      }),
    ).toBe("🎟️");
  });

  it("takes the word that comes first in the name", () => {
    expect(placeEmoji({ name: "Coffee & Donuts", kinds: [] })).toBe("☕");
    expect(placeEmoji({ name: "Bagel Bakery", kinds: [] })).toBe("🥯");
  });

  it("matches whole words only", () => {
    expect(placeEmoji({ name: "Teatro", kinds: [] })).toBeUndefined();
    expect(
      placeEmoji({ name: "Grillhaus", category: "Restaurant", kinds: [] }),
    ).toBe("🍽️");
  });

  it("draws the place's cuisine ahead of the name and a broad category", () => {
    expect(
      placeEmoji({
        name: "Lucy's Pizza",
        category: "Restaurant",
        cuisine: "burger",
        kinds: ["food"],
      }),
    ).toBe("🍔");
    expect(
      placeEmoji({ name: "Lucy's", cuisine: "ice cream", kinds: [] }),
    ).toBe("🍨");
  });

  it("keeps a specific category over the cuisine", () => {
    expect(
      placeEmoji({
        name: "Lucy's",
        category: "Brewery",
        cuisine: "burger",
        kinds: [],
      }),
    ).toBe("🍺");
  });

  it("keeps a market's cart whatever the save says it serves", () => {
    expect(
      placeEmoji({
        name: "Central Market",
        category: "FoodMarket",
        cuisine: "coffee",
        kinds: ["food"],
      }),
    ).toBe("🛒");
  });

  it("leaves a restaurant generic when its name only hints at a cuisine", () => {
    for (const name of [
      "Lotus Thai",
      "Garden Grill",
      "Blue Fish",
      "Sky Lounge",
    ])
      expect(
        placeEmoji({ name, category: "Restaurant", kinds: ["food"] }),
      ).toBe("🍽️");
    expect(
      placeEmoji({
        name: "Gino's Pizzeria",
        category: "Restaurant",
        kinds: [],
      }),
    ).toBe("🍕");
  });
});
