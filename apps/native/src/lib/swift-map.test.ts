import { expect, it } from "vitest";
import { visitMatcher } from "@convex/model/placeVisits";
import { sameTripPlace } from "@convex/model/placeIdentity";
import sharedListPlaceVectors from "../../../ios/TestData/shared-list-place-identity.json";
import parity from "../../../ios/ShelvrKit/Tests/ShelvrKitTests/Fixtures/map-parity.json";
import { withReach } from "./discover-area";
import {
  discoverBeside,
  searchEntries,
  type DiscoverPlace,
} from "./map-discover";
import { mapRowFilters, NEARBY_KM } from "./map-filters";
import { placeEmoji } from "./map-pin-emoji";
import { CUISINES, PLACE_KINDS } from "@convex/model/placeKinds";
import type { Id } from "@convex/_generated/dataModel";
import vectors from "../../../ios/ShelvrKit/Tests/ShelvrKitTests/Fixtures/map-places.json";

it("keeps the Swift map pin, filter and visit vectors current", () => {
  const beside = discoverBeside(
    vectors.saved,
    vectors.discover.map(
      (place): DiscoverPlace => ({
        ...place,
        kinds: PLACE_KINDS.filter((kind) => place.kinds.includes(kind)),
        _id: place._id as Id<"places">,
      }),
    ),
  );
  expect(beside.map((place) => place._id)).toEqual(vectors.beside);
  expect(
    mapRowFilters([...vectors.saved, ...beside]).map((filter) => filter.kind),
  ).toEqual(vectors.kinds);
  expect(
    vectors.saved.map((place) =>
      placeEmoji({
        ...place,
        cuisine: CUISINES.find((cuisine) => cuisine === place.cuisine),
      }),
    ),
  ).toEqual(vectors.emoji);
  expect(
    vectors.saved
      .filter(visitMatcher(vectors.visits, vectors.saved))
      .map((place) => place.itemId),
  ).toEqual(vectors.went);
});

it("keeps Swift shared-list picker identity in sync with the server", () => {
  for (const { existing, candidate, matches } of sharedListPlaceVectors) {
    expect(sameTripPlace(existing, candidate)).toBe(matches);
  }
});

it("keeps Swift category, cuisine and name glyphs in sync with Expo", () => {
  for (const [category, expected] of Object.entries(parity.categories)) {
    expect(placeEmoji({ category, kinds: [] })).toBe(expected);
  }
  expect(Object.keys(parity.cuisines).sort()).toEqual([...CUISINES].sort());
  for (const cuisine of CUISINES) {
    for (const name of parity.namesByCuisine[cuisine]) {
      expect(placeEmoji({ name, kinds: [] })).toBe(parity.cuisines[cuisine]);
    }
    expect(placeEmoji({ category: "Restaurant", cuisine, kinds: [] })).toBe(
      parity.cuisines[cuisine],
    );
  }
  for (const pin of parity.pins) {
    expect(
      placeEmoji({
        ...pin,
        kinds: pin.kinds ?? [],
        cuisine: CUISINES.find((cuisine) => cuisine === pin.cuisine),
      }) ?? null,
    ).toBe(pin.emoji);
  }
});

it("keeps Swift search ranking and nearby bounds in sync with Expo", () => {
  const places = parity.places.map(
    (place): typeof place & { source: "own" | "discover" } => {
      if (place.source !== "own" && place.source !== "discover") {
        throw new Error("Unknown fixture source");
      }
      return { ...place, source: place.source };
    },
  );
  for (const { query, names } of parity.search) {
    expect(searchEntries(places, query).map((entry) => entry.name)).toEqual(
      names,
    );
  }
  for (const { latitude, longitude, box, expected } of parity.reach) {
    expect(withReach(box, { latitude, longitude }, NEARBY_KM)).toEqual(
      expected,
    );
  }
});
