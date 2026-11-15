import { describe, expect, it } from "vitest";

import {
  mergeVenueKinds,
  placeKinds,
  type Cuisine,
  type PlaceKind,
} from "./placeKinds";

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
    expect(placeKinds(undefined, ["coffee shop coffee shop"])).toEqual([
      "coffee",
    ]);
    // Removing one phrase must not join its neighbours into a new one.
    expect(placeKinds(undefined, ["coffee / coffee shop / shop"])).toEqual([
      "coffee",
      "shopping",
    ]);
    expect(placeKinds(undefined, ["coffee shop and vintage shop"])).toEqual([
      "coffee",
      "shopping",
    ]);
  });

  it("ignores a category it does not know", () => {
    expect(placeKinds("Pharmacy", ["food"])).toEqual([]);
  });

  it("lets the place's cuisine decide its food or drink kind", () => {
    expect(placeKinds("Restaurant", ["dessert"], "coffee")).toEqual(["coffee"]);
    expect(placeKinds(undefined, ["food"], "cocktails")).toEqual(["drinks"]);
    expect(placeKinds("Bakery", [], "ice cream")).toEqual(["dessert"]);
    expect(placeKinds("Restaurant", ["coffee"], "tacos")).toEqual(["food"]);
    expect(placeKinds(undefined, [], "tea")).toEqual(["coffee"]);
    expect(placeKinds("Bakery", [], "bakery")).toEqual(["dessert"]);
  });

  it("keeps a coffee or drinks category beside a food cuisine", () => {
    expect(placeKinds("Cafe", ["coffee"], "brunch")).toEqual([
      "food",
      "coffee",
    ]);
    expect(placeKinds("Nightlife", [], "tacos")).toEqual(["food", "drinks"]);
    expect(placeKinds("Restaurant", [], "burger")).toEqual(["food"]);
  });

  it("ignores the cuisine of a place Apple gives a specific category", () => {
    expect(placeKinds("Museum", [], "coffee")).toEqual(["activities"]);
    expect(placeKinds("FoodMarket", [], "coffee")).toEqual(["food"]);
    expect(placeKinds("FoodMarket", ["coffee"])).toEqual(["food"]);
    expect(placeKinds("Store", ["food"], "burger")).toEqual(["shopping"]);
    expect(placeKinds("Brewery", [], "pizza")).toEqual(["drinks"]);
  });

  it("keeps date night beside the cuisine", () => {
    expect(placeKinds("Restaurant", ["date night"], "wine")).toEqual([
      "drinks",
      "dateNight",
    ]);
  });
});

describe("mergeVenueKinds", () => {
  type Venue = { cuisine?: Cuisine; kinds: PlaceKind[] };
  const plain: Venue = { kinds: ["food"] };
  const burger: Venue = { cuisine: "burger", kinds: ["food"] };
  const pizza: Venue = { cuisine: "pizza", kinds: ["food"] };

  it("keeps the kept pin's cuisine over a repeat's", () => {
    expect(mergeVenueKinds(burger, pizza).cuisine).toBe("burger");
    expect(mergeVenueKinds(pizza, burger).cuisine).toBe("pizza");
  });

  it("takes a repeat's cuisine only when the kept pin has none", () => {
    expect(mergeVenueKinds(plain, burger).cuisine).toBe("burger");
    expect(mergeVenueKinds(burger, plain).cuisine).toBe("burger");
  });
});
