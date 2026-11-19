import { expect, it } from "vitest";
import {
  groupStamps,
  placeKey,
  reelStamps,
  shownStamps,
  stampedPlaces,
  type StampSave,
} from "./map-stamps";

const bar = { name: "Bar", lat: 40.7, lng: -74 };
const park = { name: "Park", lat: 40.8, lng: -73.9 };

const save = (overrides: Partial<StampSave>): StampSave => ({
  _id: "a",
  _creationTime: 1,
  url: "https://www.instagram.com/reel/abc/",
  imageUrl: "https://cdn.example/a.jpg",
  placePins: [bar, park],
  ...overrides,
});

it("stamps a reel with a cover at its first place and counts every place", () => {
  const [stamp] = reelStamps([save({})]);
  expect(stamp).toMatchObject({
    id: "stamp:a",
    itemId: "a",
    lat: bar.lat,
    lng: bar.lng,
    cover: "https://cdn.example/a.jpg",
    count: 2,
    places: [placeKey(bar), placeKey(park)],
  });
});

it("stamps only reels that have a cover and a place", () => {
  expect(
    reelStamps([
      save({ _id: "web", url: "https://example.com/guide" }),
      save({ _id: "bare", imageUrl: null }),
      save({ _id: "nowhere", placePins: [] }),
      save({ _id: "tiktok", url: "https://www.tiktok.com/@a/video/1" }),
      save({
        _id: "hero",
        imageUrl: null,
        heroImageUrl: "https://cdn.example/hero.jpg",
      }),
    ]).map((stamp) => stamp.itemId),
  ).toEqual(["tiktok", "hero"]);
});

it("hides a stamp only when the filter hides every one of its places", () => {
  const stamps = reelStamps([save({})]);
  expect(shownStamps(stamps, [park])).toHaveLength(1);
  expect(shownStamps(stamps, [])).toHaveLength(0);
});

it("moves a stamp to its first place still shown when the filter hides the first", () => {
  const [stamp] = shownStamps(reelStamps([save({})]), [park]);
  expect(stamp).toMatchObject({
    lat: park.lat,
    lng: park.lng,
    places: [placeKey(park)],
  });
});

it("stamps each reel at the shown venue the map kept for a place they share", () => {
  const kept = { ...bar, appleId: "apple-bar" };
  const stamps = shownStamps(
    reelStamps([
      save({ _id: "a", placePins: [{ ...bar, appleId: "apple-bar" }] }),
      save({
        _id: "b",
        placePins: [{ ...bar, lat: bar.lat + 0.0001, appleId: "apple-bar" }],
      }),
    ]),
    [kept],
  );
  expect(
    stamps.map((stamp) => [stamp.itemId, stamp.lat, stamp.places]),
  ).toEqual([
    ["a", bar.lat, [placeKey(kept)]],
    ["b", bar.lat, [placeKey(kept)]],
  ]);
});

it("leaves only the stamped first place out of the dots", () => {
  expect(stampedPlaces(reelStamps([save({})]))).toEqual(
    new Set([placeKey(bar)]),
  );
});

it("shows the newest reel for stamps grouped together and lists them newest first", () => {
  const stamps = reelStamps([
    save({ _id: "old", _creationTime: 1 }),
    save({ _id: "new", _creationTime: 3 }),
    save({ _id: "mid", _creationTime: 2 }),
  ]);
  const [group] = groupStamps(stamps, 360);
  expect(group!.itemId).toBe("new");
  expect(group!.saves.map((stamp) => stamp.itemId)).toEqual([
    "new",
    "mid",
    "old",
  ]);
});
