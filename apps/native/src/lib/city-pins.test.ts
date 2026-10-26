import { describe, expect, it } from "vitest";
import { appleZoom, cityPins, cityRows, saveSource } from "./city-pins";

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
    ).toEqual([{ ...pin, itemId: "newer", number: 1 }]);
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
      { itemId: "a", name: "Time Out Market", lat: 38.7, lng: -9.1, number: 1 },
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
