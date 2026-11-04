import { describe, expect, it } from "vitest";
import {
  appleZoom,
  cityPins,
  cityRows,
  framedPins,
  saveSource,
} from "./city-pins";

describe("appleId", () => {
  it("flows from a stored pin to its city pin and row", () => {
    const saves = [
      {
        _id: "a",
        placePins: [{ name: "Jo's", lat: 30.25, lng: -97.75, appleId: "I1" }],
      },
    ];
    const [pin] = cityPins(saves);
    expect(pin.appleId).toBe("I1");
    const [row] = cityRows(saves, [pin]);
    expect(row.kind === "place" && row.pin.appleId).toBe("I1");
  });
});

describe("cityRows", () => {
  it("lists and numbers each place from a single reel separately", () => {
    const saves = [
      {
        _id: "a",
        placePins: [
          { name: "Jo's Coffee", lat: 30.25, lng: -97.75 },
          { name: "June's", lat: 30.24, lng: -97.75 },
        ],
      },
    ];
    expect(cityRows(saves, cityPins(saves))).toEqual([
      {
        kind: "place",
        pin: cityPins(saves)[0],
        id: "a:Jo's Coffee:30.25:-97.75",
        number: 1,
        name: "Jo's Coffee",
        item: saves[0],
      },
      {
        kind: "place",
        pin: cityPins(saves)[1],
        id: "a:June's:30.24:-97.75",
        number: 2,
        name: "June's",
        item: saves[0],
      },
    ]);
  });

  it("deduplicates shared places while keeping every source save reachable", () => {
    const pin = { name: "Micho", lat: 48.866, lng: 2.337 };
    const saves = [
      { _id: "newer", placePins: [pin] },
      { _id: "older", placePins: [pin] },
      { _id: "unlocated" },
      { _id: "empty", placePins: [] },
    ];
    expect(cityRows(saves, cityPins(saves))).toEqual([
      {
        kind: "place",
        pin: cityPins(saves)[0],
        id: "newer:Micho:48.866:2.337",
        number: 1,
        name: "Micho",
        item: saves[0],
      },
      { id: "older", kind: "save", item: saves[1] },
      { id: "unlocated", kind: "save", item: saves[2] },
      { id: "empty", kind: "save", item: saves[3] },
    ]);
    expect(cityRows([], [])).toEqual([]);
  });
});

describe("cityPins", () => {
  it("shows a place once when two reels name the same mapped restaurant", () => {
    const pin = { name: "Micho", lat: 48.8660723, lng: 2.3371738 };
    expect(
      cityPins([
        { _id: "newer", placePins: [pin] },
        { _id: "older", placePins: [pin] },
      ]),
    ).toEqual([{ ...pin, itemId: "newer", kinds: [], number: 1 }]);
  });
  it("keeps every kind and the first category across a venue's saves", () => {
    const pin = { name: "Micho", lat: 48.8660723, lng: 2.3371738 };
    const [merged] = cityPins([
      { _id: "newer", tags: ["dinner"], placePins: [pin] },
      {
        _id: "older",
        tags: ["date night"],
        placePins: [{ ...pin, category: "Nightlife" }],
      },
    ]);
    expect(merged.itemId).toBe("newer");
    expect(merged.category).toBe("Nightlife");
    expect(merged.kinds).toContain("dateNight");
    expect(merged.kinds).toContain("food");
    expect(merged.emoji).toBe("🍸");
  });

  it("shows a place once when two lookups land it a few doors apart", () => {
    expect(
      cityPins([
        {
          _id: "newer",
          placePins: [{ name: "Chrissy's Pizza", lat: 40.7237, lng: -73.9502 }],
        },
        {
          _id: "older",
          placePins: [{ name: "Chrissy’s Pizza", lat: 40.7239, lng: -73.9507 }],
        },
      ]).map((pin) => pin.itemId),
    ).toEqual(["newer"]);
  });

  it("shows a place once when Apple names the same venue two ways", () => {
    expect(
      cityPins([
        {
          _id: "a",
          placePins: [
            { name: "Cloud Gate", lat: 41.8827, lng: -87.6233, appleId: "I9" },
          ],
        },
        {
          _id: "b",
          placePins: [
            { name: "The Bean", lat: 41.8826, lng: -87.6234, appleId: "I9" },
          ],
        },
      ]).map((pin) => pin.name),
    ).toEqual(["Cloud Gate"]);
  });

  it("remembers the Apple id of a pin merged by name", () => {
    expect(
      cityPins([
        {
          _id: "a",
          placePins: [{ name: "Cloud Gate", lat: 41.8827, lng: -87.6233 }],
        },
        {
          _id: "b",
          placePins: [
            { name: "Cloud Gate", lat: 41.8826, lng: -87.6234, appleId: "I9" },
          ],
        },
        {
          _id: "c",
          placePins: [
            { name: "The Bean", lat: 41.8826, lng: -87.6234, appleId: "I9" },
          ],
        },
      ]).map((pin) => pin.itemId),
    ).toEqual(["a"]);
  });

  it("gives the kept place the Apple id a merged repeat carried", () => {
    const [pin] = cityPins([
      {
        _id: "older",
        placePins: [{ name: "Cloud Gate", lat: 41.8827, lng: -87.6233 }],
      },
      {
        _id: "newer",
        placePins: [
          { name: "Cloud Gate", lat: 41.8826, lng: -87.6234, appleId: "I9" },
        ],
      },
    ]);
    expect(pin).toMatchObject({ itemId: "older", appleId: "I9" });
  });

  it("keeps two nearby branches Apple names as separate places", () => {
    expect(
      cityPins([
        {
          _id: "a",
          placePins: [
            { name: "Starbucks", lat: 41.8827, lng: -87.6233, appleId: "S1" },
          ],
        },
        {
          _id: "b",
          placePins: [
            { name: "Starbucks", lat: 41.8845, lng: -87.6233, appleId: "S2" },
            { name: "Starbucks", lat: 41.8845, lng: -87.6234, appleId: "S2" },
          ],
        },
      ]).map((pin) => pin.appleId),
    ).toEqual(["S1", "S2"]);
  });

  it("keeps two branches of one name in different parts of town", () => {
    expect(
      cityPins([
        {
          _id: "a",
          placePins: [
            { name: "Joe's Pizza", lat: 40.7306, lng: -74.0021 },
            { name: "Joe's Pizza", lat: 40.7547, lng: -73.9873 },
          ],
        },
      ]),
    ).toHaveLength(2);
  });

  it("tags each stored pin with its save and skips saves without pins", () => {
    const saves = [
      {
        _id: "a",
        placePins: [{ name: "Time Out Market", lat: 38.7, lng: -9.1 }],
      },
      { _id: "b" },
    ];
    expect(cityPins(saves)).toEqual([
      {
        itemId: "a",
        name: "Time Out Market",
        lat: 38.7,
        lng: -9.1,
        kinds: [],
        number: 1,
      },
    ]);
  });
});

describe("saveSource", () => {
  it("names the platform, else the author, else the site", () => {
    expect(saveSource({ url: "https://www.tiktok.com/@x/video/1" })).toBe(
      "TikTok",
    );
    expect(saveSource({ url: "https://a.com/x", author: "Ana" })).toBe("Ana");
    expect(saveSource({ siteName: "Eater" })).toBe("Eater");
  });
});

describe("appleZoom", () => {
  it("zooms in further when the map is shorter than it is wide", () => {
    expect(appleZoom(12, 0, 400, 400)).toBeCloseTo(12 + Math.log2(256 / 400));
    expect(appleZoom(12, 38.7, 400, 300)).toBeGreaterThan(
      appleZoom(12, 38.7, 400, 400),
    );
  });
});

describe("framedPins", () => {
  const downtown = [
    { lat: 41.8826, lng: -87.6226 },
    { lat: 41.8827, lng: -87.6233 },
    { lat: 41.8837, lng: -87.6251 },
    { lat: 41.8947, lng: -87.6244 },
    { lat: 41.8917, lng: -87.6086 },
  ];

  it("opens on downtown when one place is far south of it", () => {
    const far = { lat: 41.6, lng: -87.6 };
    expect(framedPins([...downtown, far])).toEqual(downtown);
  });

  it("keeps a spread-out city's places in view", () => {
    const la = [
      { lat: 34.0522, lng: -118.2437 },
      { lat: 34.0195, lng: -118.4912 },
      { lat: 34.1016, lng: -118.3267 },
      { lat: 33.985, lng: -118.4695 },
      { lat: 34.0736, lng: -118.4004 },
    ];
    expect(framedPins(la)).toEqual(la);
  });

  it("frames every pin when there are too few to tell a stray", () => {
    const two = [downtown[0], { lat: 41.6, lng: -87.6 }];
    expect(framedPins(two)).toEqual(two);
  });
});

describe("cuisine", () => {
  it("picks a city pin's emoji and kind", () => {
    const [pin] = cityPins([
      {
        _id: "a",
        tags: ["food"],
        placePins: [
          {
            name: "Lucy's",
            lat: 29.75,
            lng: -95.36,
            category: "Restaurant",
            cuisine: "coffee",
          },
        ],
      },
    ]);
    expect(pin).toMatchObject({
      cuisine: "coffee",
      emoji: "☕",
      kinds: ["coffee"],
    });
  });

  it("fills a venue's cuisine from an older save when the newer has none", () => {
    const pin = { name: "Lucy's", lat: 29.75, lng: -95.36 };
    const [merged] = cityPins([
      { _id: "newer", placePins: [pin] },
      { _id: "older", placePins: [{ ...pin, cuisine: "burger" as const }] },
    ]);
    expect(merged).toMatchObject({
      itemId: "newer",
      cuisine: "burger",
      emoji: "🍔",
      kinds: ["food"],
    });
  });

  it("keeps the newer save's cuisine when two saves disagree", () => {
    const pin = { name: "Lucy's", lat: 29.75, lng: -95.36 };
    const [merged] = cityPins([
      { _id: "newer", placePins: [{ ...pin, cuisine: "tacos" as const }] },
      { _id: "older", placePins: [{ ...pin, cuisine: "coffee" as const }] },
    ]);
    expect(merged).toMatchObject({
      itemId: "newer",
      cuisine: "tacos",
      emoji: "🌮",
      kinds: ["food", "coffee"],
    });
  });
});
