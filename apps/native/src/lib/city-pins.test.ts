import { describe, expect, it } from "vitest";
import { appleZoom, cityPins, numberSaves, saveSource } from "./city-pins";

describe("numberSaves", () => {
  it("numbers only saves with a pin, in list order", () => {
    const saves = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];
    const pins = [{ itemId: "c" }, { itemId: "a" }, { itemId: "a" }];
    expect([...numberSaves(saves, pins)]).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
  });
});

describe("cityPins", () => {
  it("tags each stored pin with its save and skips saves without pins", () => {
    const saves = [
      {
        _id: "a",
        placePins: [{ name: "Time Out Market", lat: 38.7, lng: -9.1 }],
      },
      { _id: "b" },
    ];
    expect(cityPins(saves)).toEqual([
      { itemId: "a", name: "Time Out Market", lat: 38.7, lng: -9.1 },
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
