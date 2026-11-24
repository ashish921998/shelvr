import { expect, it } from "vitest";
import { visitMatcher } from "@convex/model/placeVisits";
import { discoverBeside, type DiscoverPlace } from "./map-discover";
import { mapRowFilters } from "./map-filters";
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
        city: "Lisbon",
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
