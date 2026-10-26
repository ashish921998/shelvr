import { describe, expect, it } from "vitest";

import {
  appleMapsUrl,
  googleMapsUrl,
  parseReelLink,
  parseReelPlaces,
} from "./reelPlaces";

describe("parseReelLink", () => {
  it.each([
    [
      "https://www.instagram.com/reel/C8abc123/",
      "https://www.instagram.com/reel/C8abc123/",
    ],
    ["  instagram.com/reel/C8abc123  ", "https://instagram.com/reel/C8abc123"],
    ["https://vm.tiktok.com/ZMabc/", "https://vm.tiktok.com/ZMabc/"],
    ["https://instagr.am/reel/C8abc123/", "https://instagr.am/reel/C8abc123/"],
    [
      "https://www.instagram.com/someone/p/C8abc123/",
      "https://www.instagram.com/someone/p/C8abc123/",
    ],
  ])("accepts %s", (input, expected) => {
    expect(parseReelLink(input)).toBe(expected);
  });

  it.each([
    "",
    "https://example.com/reel/1",
    "https://notinstagram.com/reel/1",
    "https://instagram.com.evil.example/reel/1",
    "javascript:alert(1)",
    "https://user:pass@www.instagram.com/reel/C8abc123/",
    "https://www.instagram.com:8443/reel/C8abc123/",
    "https://www.instagram.com/someone/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/reels/audio/123/",
    `https://www.instagram.com/${"a".repeat(600)}`,
  ])("refuses %s", (input) => {
    expect(parseReelLink(input)).toBeUndefined();
  });
});

describe("parseReelPlaces", () => {
  it("keeps clean places and drops malformed ones", () => {
    expect(
      parseReelPlaces({
        city: " Lisbon ",
        places: [
          { name: "Time Out Market", city: "Lisbon" },
          { name: "   " },
          { city: "Lisbon" },
          "Manteigaria",
          { name: "Manteigaria" },
        ],
      }),
    ).toEqual({
      city: "Lisbon",
      places: [
        { name: "Time Out Market", city: "Lisbon" },
        { name: "Manteigaria" },
      ],
    });
  });

  it("refuses an answer without a places list", () => {
    expect(parseReelPlaces({})).toBeUndefined();
    expect(parseReelPlaces(null)).toBeUndefined();
  });

  it("caps the list and each name", () => {
    const places = Array.from({ length: 60 }, (_, i) => ({
      name: `${i}`.padEnd(300, "x"),
    }));
    const parsed = parseReelPlaces({ places });
    expect(parsed?.places).toHaveLength(30);
    expect(parsed?.places[0]?.name).toHaveLength(120);
  });
});

describe("map links", () => {
  it("searches the name and city, encoded", () => {
    const place = { name: "Pastéis de Belém", city: "Lisbon" };
    expect(appleMapsUrl(place)).toBe(
      "https://maps.apple.com/?q=Past%C3%A9is%20de%20Bel%C3%A9m%2C%20Lisbon",
    );
    expect(googleMapsUrl(place)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Past%C3%A9is%20de%20Bel%C3%A9m%2C%20Lisbon",
    );
  });

  it("searches the name alone when there is no city", () => {
    expect(appleMapsUrl({ name: "Manteigaria" })).toBe(
      "https://maps.apple.com/?q=Manteigaria",
    );
  });
});
