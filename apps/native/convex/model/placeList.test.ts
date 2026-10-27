import { describe, expect, it } from "vitest";
import {
  intentsForPart,
  MAX_LIST_PARTS,
  partIndexFor,
  placeListCitiesPrompt,
  placeListContent,
  splitPlaceList,
  type ListedPlace,
} from "./placeList";

function place(name: string, lat?: number, lng?: number): ListedPlace {
  return {
    name,
    address: `${name} street`,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  };
}

function named(...cities: string[]) {
  return { cities: cities.map((city, i) => ({ index: i + 1, city })) };
}

describe("splitPlaceList", () => {
  it("keeps a one-city list whole, under the list's own title", () => {
    const parts = splitPlaceList(
      "Date night",
      [place("Bar A"), place("Bar B")],
      named("Lisbon", "Lisbon"),
    );
    expect(parts).toEqual([
      {
        title: "Date night",
        cities: ["Lisbon"],
        places: ["Bar A", "Bar B"],
        content: "Bar A\nBar B",
      },
    ]);
  });

  it("makes one save per city, biggest city first", () => {
    const parts = splitPlaceList(
      "Japan",
      [place("Mori Mori"), place("Savoy"), place("Noyanopan")],
      named("Karuizawa", "Tokyo", "Tokyo"),
    );
    expect(parts.map((part) => [part.title, part.cities, part.places])).toEqual(
      [
        ["Japan · Tokyo", ["Tokyo"], ["Savoy", "Noyanopan"]],
        ["Japan · Karuizawa", ["Karuizawa"], ["Mori Mori"]],
      ],
    );
  });

  it("names a part by its city alone when the list is named for that city", () => {
    const parts = splitPlaceList(
      "Tokyo",
      [place("Savoy"), place("Mori Mori")],
      named("Tokyo", "Karuizawa"),
    );
    expect(parts.map((part) => part.title)).toEqual([
      "Tokyo",
      "Tokyo · Karuizawa",
    ]);
  });

  it("splits a city past a save's worth into numbered parts", () => {
    const places = Array.from({ length: 65 }, (_, i) => place(`Spot ${i}`));
    const parts = splitPlaceList(
      "Paris",
      places,
      named(...places.map(() => "Paris")),
    );
    expect(parts.map((part) => [part.title, part.places.length])).toEqual([
      ["Paris 1", 30],
      ["Paris 2", 30],
      ["Paris 3", 5],
    ]);
  });

  it("gives a place the model could not name the city of a listed place nearby", () => {
    const parts = splitPlaceList(
      "Tokyo",
      [
        place("Savoy", 35.6548, 139.7364),
        place("Wagyu burger", 35.6617, 139.7354),
        place("Far away", 40.7, -74),
      ],
      named("Tokyo", "", ""),
    );
    expect(parts.map((part) => [part.cities, part.places])).toEqual([
      [["Tokyo"], ["Savoy", "Wagyu burger"]],
      [[], ["Far away"]],
    ]);
  });

  it("ignores numbers the list does not have and a second answer for a place", () => {
    const parts = splitPlaceList("Rome", [place("Roscioli")], {
      cities: [
        { index: 0, city: "Milan" },
        { index: 1, city: "Rome" },
        { index: 1, city: "Naples" },
        { index: 7, city: "Turin" },
      ],
    });
    expect(parts.map((part) => part.cities)).toEqual([["Rome"]]);
  });

  it("drops a place's city suffix once the save has that one city", () => {
    const parts = splitPlaceList(
      "Lisbon",
      [place("Manteigaria, Lisbon")],
      named("Lisbon"),
    );
    expect(parts[0].places).toEqual(["Manteigaria"]);
  });

  it("gives every part its own title, even a city's and the unplaced places'", () => {
    const parts = splitPlaceList(
      "Tokyo",
      [place("Savoy"), place("Noyanopan"), place("Somewhere")],
      named("Tokyo", "Tokyo", ""),
    );
    expect(parts.map((part) => [part.title, part.places])).toEqual([
      ["Tokyo", ["Savoy", "Noyanopan"]],
      ["Tokyo (2)", ["Somewhere"]],
    ]);
  });

  it("stops at the part cap", () => {
    const places = Array.from({ length: MAX_LIST_PARTS + 3 }, (_, i) =>
      place(`Spot ${i}`),
    );
    const parts = splitPlaceList(
      "World",
      places,
      named(...places.map((_, i) => `City ${i}`)),
    );
    expect(parts).toHaveLength(MAX_LIST_PARTS);
  });
});

describe("partIndexFor", () => {
  const parts = splitPlaceList(
    "Japan",
    [place("A"), place("B"), place("C")],
    named("Tokyo", "Tokyo", "Kyoto"),
  );

  it("keeps a save the part it was named for", () => {
    expect(partIndexFor(parts, "Japan · Kyoto")).toBe(1);
  });

  it("gives a new or renamed save the first part", () => {
    expect(partIndexFor(parts, undefined)).toBe(0);
    expect(partIndexFor(parts, "My trip")).toBe(0);
  });
});

describe("place list text", () => {
  it("numbers places for the model with their address and point", () => {
    const prompt = placeListCitiesPrompt([place("Savoy", 35.65481, 139.73648)]);
    expect(prompt).toContain("1. Savoy | Savoy street | at 35.655, 139.736");
    expect(prompt.startsWith("Name the city")).toBe(true);
  });

  it("writes a line per place with its note", () => {
    expect(
      placeListContent([
        { name: "Marcy Land", note: "Uni ramen" },
        { name: "Noyanopan" },
      ]),
    ).toBe("Marcy Land — Uni ramen\nNoyanopan");
  });
});

describe("intentsForPart", () => {
  const [tokyo] = splitPlaceList(
    "Japan",
    [place("Savoy"), place("Noyanopan"), place("Ippodo")],
    named("Tokyo", "Tokyo", "Kyoto"),
  );

  it("keeps Maps intents for the part's own places and every other kind", () => {
    const intents = [
      { kind: "open_maps", label: "Map", value: "Savoy, Tokyo" },
      { kind: "open_maps", label: "Map", value: "Ippodo" },
      { kind: "web_search", label: "Search", value: "Ippodo" },
    ];
    expect(intentsForPart(intents, tokyo)).toEqual([intents[0], intents[2]]);
  });
});
