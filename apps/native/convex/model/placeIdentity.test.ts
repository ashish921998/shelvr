import { describe, expect, it } from "vitest";

import { sameTripPlace } from "./placeIdentity";

const LISBON = { lat: 38.71, lng: -9.14 };
const NEXT_DOOR = { lat: 38.7101, lng: -9.14 };
const ACROSS_TOWN = { lat: 38.76, lng: -9.14 };

describe("sameTripPlace", () => {
  it("matches one Apple id wherever its pins are", () => {
    expect(
      sameTripPlace(
        { name: "Starbucks", appleId: "A-1", ...LISBON },
        { name: "Starbucks Chiado", appleId: "A-1", ...ACROSS_TOWN },
      ),
    ).toBe(true);
  });

  it("keeps two Apple ids apart, even next door under one name", () => {
    expect(
      sameTripPlace(
        { name: "Starbucks", appleId: "A-1", ...LISBON },
        { name: "Starbucks", appleId: "A-2", ...ACROSS_TOWN },
      ),
    ).toBe(false);
    expect(
      sameTripPlace(
        { name: "Starbucks", appleId: "A-1", ...LISBON },
        { name: "Starbucks", appleId: "A-2", ...NEXT_DOOR },
      ),
    ).toBe(false);
  });

  it("matches the same save's place by name", () => {
    expect(
      sameTripPlace(
        { name: "Kafeine", itemId: "item-1", ...LISBON },
        { name: " kafeine ", itemId: "item-1", ...ACROSS_TOWN },
      ),
    ).toBe(true);
  });

  it("falls back to a near namesake when a side has no Apple id", () => {
    expect(
      sameTripPlace(
        { name: "Santa Joana", appleId: "A-1", ...LISBON },
        { name: "Santa Joana", itemId: "item-1", ...NEXT_DOOR },
      ),
    ).toBe(true);
    expect(
      sameTripPlace(
        { name: "Santa Joana", appleId: "A-1", ...LISBON },
        { name: "Santa Joana", itemId: "item-1", ...ACROSS_TOWN },
      ),
    ).toBe(false);
    expect(
      sameTripPlace(
        { name: "Red Frog", ...LISBON },
        { name: "Kafeine", ...NEXT_DOOR },
      ),
    ).toBe(false);
  });
});
