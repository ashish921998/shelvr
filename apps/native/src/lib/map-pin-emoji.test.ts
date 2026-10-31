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
});
