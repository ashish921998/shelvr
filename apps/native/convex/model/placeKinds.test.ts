import { describe, expect, it } from "vitest";

import { placeKinds } from "./placeKinds";

describe("placeKinds", () => {
  it("trusts Apple's category over the save's tags", () => {
    expect(placeKinds("Museum", ["food", "dessert"])).toEqual(["activities"]);
    expect(placeKinds("Hotel", [])).toEqual(["stay"]);
  });

  it("lets the save say a restaurant is a dessert or coffee stop", () => {
    expect(placeKinds("Restaurant", ["Ice Cream", "coffee"])).toEqual([
      "food",
      "coffee",
      "dessert",
    ]);
  });

  it("falls back to the save's tags when Apple gave no category", () => {
    expect(placeKinds(undefined, ["cocktails", "things to do"])).toEqual([
      "drinks",
      "activities",
    ]);
    expect(placeKinds(undefined, ["travel"])).toEqual([]);
  });

  it("marks date night only where one can happen", () => {
    expect(placeKinds("Restaurant", ["date night"])).toEqual([
      "food",
      "dateNight",
    ]);
    expect(placeKinds(undefined, ["romantic"])).toEqual(["dateNight"]);
    expect(placeKinds("Parking", ["date night"])).toEqual([]);
    expect(placeKinds("Hotel", ["date night"])).toEqual(["stay"]);
  });

  it("ignores a category it does not know", () => {
    expect(placeKinds("Pharmacy", ["food"])).toEqual([]);
  });
});
