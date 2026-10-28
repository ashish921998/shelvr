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

  it("reads a known word or phrase inside a longer tag", () => {
    expect(placeKinds(undefined, ["sf restaurants", "dining out"])).toEqual([
      "food",
    ]);
    expect(placeKinds(undefined, ["Rooftop Bars NYC"])).toEqual(["drinks"]);
    expect(placeKinds(undefined, ["best café in town"])).toEqual(["coffee"]);
    expect(placeKinds(undefined, ["first date ideas"])).toEqual(["dateNight"]);
  });

  it("matches whole words only, and a phrase hides the words inside it", () => {
    expect(placeKinds(undefined, ["parking", "seafood", "cheesecake"])).toEqual(
      [],
    );
    // "coffee shop" is a coffee word, not shopping.
    expect(placeKinds(undefined, ["coffee shop"])).toEqual(["coffee"]);
    expect(placeKinds(undefined, ["sf coffee shop"])).toEqual(["coffee"]);
  });

  it("ignores a category it does not know", () => {
    expect(placeKinds("Pharmacy", ["food"])).toEqual([]);
  });
});
