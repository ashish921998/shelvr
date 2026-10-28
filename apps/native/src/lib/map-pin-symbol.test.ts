import { describe, expect, it } from "vitest";

import { DEFAULT_PIN_SYMBOL, placeSymbol } from "./map-pin-symbol";

describe("placeSymbol", () => {
  it("draws Apple's category when the pin has one", () => {
    expect(placeSymbol({ category: "Restaurant", kinds: ["food"] })).toBe(
      "fork.knife",
    );
    expect(placeSymbol({ category: "Nightlife", kinds: ["drinks"] })).toBe(
      "wineglass.fill",
    );
    expect(placeSymbol({ category: "Museum", kinds: ["activities"] })).toBe(
      "building.columns.fill",
    );
    // Two "things to do" places still look different.
    expect(placeSymbol({ category: "Park", kinds: ["activities"] })).toBe(
      "tree.fill",
    );
  });

  it("keeps the category over the save's tags", () => {
    expect(
      placeSymbol({ category: "Restaurant", kinds: ["food", "dessert"] }),
    ).toBe("fork.knife");
  });

  it("falls back to the most specific kind without a known category", () => {
    expect(placeSymbol({ kinds: ["food", "coffee"] })).toBe(
      "cup.and.saucer.fill",
    );
    expect(placeSymbol({ kinds: ["drinks", "dateNight"] })).toBe(
      "wineglass.fill",
    );
    expect(placeSymbol({ category: "Pharmacy", kinds: ["shopping"] })).toBe(
      "bag.fill",
    );
  });

  it("shows a plain pin when nothing says what the place is", () => {
    expect(placeSymbol({ kinds: [] })).toBe(DEFAULT_PIN_SYMBOL);
    expect(placeSymbol({ kinds: ["dateNight"] })).toBe(DEFAULT_PIN_SYMBOL);
    expect(placeSymbol({ category: "Pharmacy", kinds: [] })).toBe(
      DEFAULT_PIN_SYMBOL,
    );
  });
});
